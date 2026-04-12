import * as http from 'http';
import { Injectable, NotFoundException, BadRequestException, ConflictException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Header, Footer, AlignmentType } from 'docx';
const CLAIM_DRAFTER_URL = process.env.CLAIM_DRAFTER_URL || 'http://localhost:3002';
const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ||
  (() => {
    console.warn(
      '[PatentForge] INTERNAL_SERVICE_SECRET is not set — using insecure default. ' +
        'Add it to backend/.env for any networked deployment. Generate one: openssl rand -hex 32',
    );
    return 'patentforge-internal';
  })();

/** Shape of a single claim returned by the Python claim-drafter. */
interface ClaimDrafterClaim {
  claim_number: number;
  claim_type: string;
  scope_level?: string | null;
  statutory_type?: string | null;
  parent_claim_number?: number | null;
  text: string;
  examiner_notes?: string;
}

/** Response from the Python claim-drafter /draft/sync endpoint. */
interface ClaimDrafterResponse {
  status: string;
  error_message?: string;
  claims: ClaimDrafterClaim[];
  specification_language?: string | null;
  planner_strategy?: string | null;
  examiner_feedback?: string | null;
  revision_notes?: string | null;
  total_estimated_cost_usd?: number | null;
}

/**
 * Request body sent to the Python claim-drafter service.
 * Must match the ClaimDraftRequest Pydantic model in services/claim-drafter/src/models.py.
 */
interface ClaimDraftRequestBody {
  invention_narrative: string;
  feasibility_stage_5: string;
  feasibility_stage_6: string;
  prior_art_results: Array<{
    patent_number: string;
    title: string;
    abstract: string | null;
    relevance_score: number;
    claims_text: string | null;
  }>;
  settings: {
    api_key: string;
    default_model: string;
    research_model: string;
    max_tokens: number;
  };
}

@Injectable()
export class ClaimDraftService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * On service startup, mark any RUNNING drafts from a previous crash as ERROR.
   * Prevents permanently stuck drafts that block new runs via the concurrency guard.
   */
  async onModuleInit() {
    const { count } = await this.prisma.claimDraft.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'ERROR', completedAt: new Date() },
    });
    if (count > 0) {
      console.warn(`[ClaimDraft] Cleaned up ${count} stuck RUNNING draft(s) from previous session`);
    }
  }

  /**
   * Start a new claim draft for a project.
   * Collects invention narrative, feasibility outputs, and prior art,
   * then calls the Python claim-drafter service.
   */
  async startDraft(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { invention: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    if (!project.invention) throw new NotFoundException('No invention form — fill it in first');

    // Prevent concurrent drafts — only one RUNNING draft per project
    const running = await this.prisma.claimDraft.findFirst({
      where: { projectId, status: 'RUNNING' },
    });
    if (running) {
      throw new ConflictException(
        'A claim draft is already running for this project. Wait for it to complete or try again later.',
      );
    }

    const settings = await this.settingsService.getSettings();
    if (!settings.anthropicApiKey) {
      throw new NotFoundException('No Anthropic API key configured. Add one in Settings.');
    }

    // Enforce cost cap before starting claim drafting — aggregate ALL pipeline costs
    if (settings.costCapUsd > 0) {
      const stages = await this.prisma.feasibilityStage.findMany({
        where: {
          feasibilityRun: { projectId },
          estimatedCostUsd: { not: null },
        },
        select: { estimatedCostUsd: true },
      });
      const complianceChecks = await this.prisma.complianceCheck.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const prevApps = await this.prisma.patentApplication.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const prevDrafts = await this.prisma.claimDraft.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const spent =
        stages.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0) +
        complianceChecks.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0) +
        prevApps.reduce((sum, a) => sum + (a.estimatedCostUsd ?? 0), 0) +
        prevDrafts.reduce((sum, d) => sum + (d.estimatedCostUsd ?? 0), 0);
      if (spent >= settings.costCapUsd) {
        throw new BadRequestException(
          `Cost cap exceeded. You have spent $${spent.toFixed(2)} of your $${settings.costCapUsd.toFixed(2)} cap. ` +
            `Increase the cost cap in Settings to continue.`,
        );
      }
    }

    const { stage5, stage6, priorArtResults } = await this.getFeasibilityContext(projectId);

    // Build invention narrative
    const inv = project.invention;
    const narrative = [
      `Title: ${inv.title}`,
      `Description: ${inv.description}`,
      inv.problemSolved ? `Problem Solved: ${inv.problemSolved}` : '',
      inv.howItWorks ? `How It Works: ${inv.howItWorks}` : '',
      inv.aiComponents ? `AI/ML Components: ${inv.aiComponents}` : '',
      inv.threeDPrintComponents ? `3D Print Components: ${inv.threeDPrintComponents}` : '',
      inv.whatIsNovel ? `What Is Novel: ${inv.whatIsNovel}` : '',
      inv.currentAlternatives ? `Current Alternatives: ${inv.currentAlternatives}` : '',
      inv.whatIsBuilt ? `What Is Built: ${inv.whatIsBuilt}` : '',
      inv.whatToProtect ? `What To Protect: ${inv.whatToProtect}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    // Create claim draft record
    const lastDraft = await this.prisma.claimDraft.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = (lastDraft?.version ?? 0) + 1;

    const draft = await this.prisma.claimDraft.create({
      data: {
        projectId,
        version,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Call claim drafter service (fire and forget — frontend polls for status)
    // finally block guarantees draft status is resolved even if error handling itself fails
    (async () => {
      try {
        await this.callClaimDrafter(draft.id, {
          invention_narrative: narrative,
          feasibility_stage_5: stage5,
          feasibility_stage_6: stage6,
          prior_art_results: priorArtResults,
          settings: {
            api_key: settings.anthropicApiKey,
            default_model: settings.defaultModel,
            research_model: settings.researchModel || '',
            max_tokens: settings.maxTokens,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ClaimDraft] Pipeline failed for draft ${draft.id}:`, msg);
      } finally {
        // Ensure draft is never left in RUNNING status
        const current = await this.prisma.claimDraft.findUnique({ where: { id: draft.id } });
        if (current && current.status === 'RUNNING') {
          await this.prisma.claimDraft
            .update({
              where: { id: draft.id },
              data: { status: 'ERROR', completedAt: new Date() },
            })
            .catch((e) => console.error(`[ClaimDraft] Failed to update draft status: ${e.message}`));
        }
      }
    })();

    return draft;
  }

  /**
   * Fetch feasibility context (stage 5 IP Strategy, stage 6 Comprehensive Report,
   * and prior art results) for a project. Used by both startDraft and regenerateClaim
   * so regenerated claims have the same novelty analysis context as the original.
   */
  private async getFeasibilityContext(projectId: string): Promise<{
    stage5: string;
    stage6: string;
    priorArtResults: Array<{
      patent_number: string;
      title: string;
      abstract: string | null;
      relevance_score: number;
      claims_text: string | null;
    }>;
  }> {
    // Get latest feasibility run
    const feasRun = await this.prisma.feasibilityRun.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { stages: { orderBy: { stageNumber: 'asc' } } },
    });

    // Truncate feasibility stages to keep the claim-drafter request under 30K chars.
    // The planner agent uses these for context — the first 15K chars of each stage
    // contain the key findings, novelty analysis, and recommendations.
    const MAX_STAGE_CHARS = 15_000;
    const rawStage5 = feasRun?.stages?.find((s) => s.stageNumber === 5)?.outputText ?? '';
    const rawStage6 = feasRun?.stages?.find((s) => s.stageNumber === 6)?.outputText ?? '';
    const stage5 =
      rawStage5.length > MAX_STAGE_CHARS
        ? rawStage5.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for claim drafting context]'
        : rawStage5;
    const stage6 =
      rawStage6.length > MAX_STAGE_CHARS
        ? rawStage6.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for claim drafting context]'
        : rawStage6;

    // Get prior art results
    const priorArt = await this.prisma.priorArtSearch.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { results: { orderBy: { relevanceScore: 'desc' }, take: 10 } },
    });

    // Get cached claims for top prior art results
    const priorArtResults: Array<{
      patent_number: string;
      title: string;
      abstract: string | null;
      relevance_score: number;
      claims_text: string | null;
    }> = [];
    if (priorArt?.results) {
      for (const r of priorArt.results) {
        const cached = await this.prisma.patentDetail.findUnique({
          where: { patentNumber: r.patentNumber },
          select: { claimsText: true },
        });
        priorArtResults.push({
          patent_number: r.patentNumber,
          title: r.title,
          abstract: r.abstract,
          relevance_score: r.relevanceScore,
          claims_text: cached?.claimsText ?? null,
        });
      }
    }

    return { stage5, stage6, priorArtResults };
  }

  /**
   * Call the Python claim-drafter service and save results.
   */
  private async callClaimDrafter(draftId: string, requestBody: ClaimDraftRequestBody) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    // Use http.request for full timeout control — fetch has a ~5 min socket timeout
    // that can't be overridden, but AI claim drafting takes 5-8 minutes.
    const result = await new Promise<ClaimDrafterResponse>((resolve, reject) => {
      const url = new URL(`${CLAIM_DRAFTER_URL}/draft/sync`);

      const data = JSON.stringify(requestBody);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
          timeout: 900_000, // 15 minutes — 3 AI agents with large context can take 10+ min
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (res.statusCode !== 200) {
              reject(new Error(`Claim drafter returned ${res.statusCode}: ${body}`));
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error(`Invalid JSON from claim drafter: ${body.slice(0, 200)}`));
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Claim drafter request timed out (10 min)'));
      });
      req.on('error', (e: Error) => reject(new Error(`Claim drafter request failed: ${e.message}`)));
      req.write(data);
      req.end();
    });

    if (result.status === 'ERROR') {
      console.error(
        `[ClaimDraft] Claim drafter returned ERROR for ${draftId}: ${result.error_message ?? 'no message'}`,
      );
      await this.prisma.claimDraft.update({
        where: { id: draftId },
        data: { status: 'ERROR', completedAt: new Date() },
      });
      return;
    }

    // Save claims to DB
    for (const claim of result.claims) {
      await this.prisma.claim.create({
        data: {
          draftId,
          claimNumber: claim.claim_number,
          claimType: claim.claim_type,
          scopeLevel: claim.scope_level ?? null,
          statutoryType: claim.statutory_type ?? null,
          parentClaimNumber: claim.parent_claim_number ?? null,
          text: claim.text,
          examinerNotes: claim.examiner_notes ?? '',
        },
      });
    }

    // Update draft with metadata (including cost so cumulative cost tracking is complete)
    await this.prisma.claimDraft.update({
      where: { id: draftId },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        specLanguage: result.specification_language || null,
        plannerStrategy: result.planner_strategy || null,
        examinerFeedback: result.examiner_feedback || null,
        revisionNotes: result.revision_notes || null,
        estimatedCostUsd: result.total_estimated_cost_usd ?? null,
      },
    });
  }

  /**
   * Prepare a claim draft for streaming: validates the project, enforces concurrency
   * and cost cap, builds the request body, and creates the RUNNING draft record.
   * Returns the draftId and the request body to send to the upstream service.
   * Used by the controller's SSE stream endpoint.
   */
  async prepareDraft(projectId: string): Promise<{ draftId: string; requestBody: ClaimDraftRequestBody }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { invention: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    if (!project.invention) throw new NotFoundException('No invention form — fill it in first');

    // Prevent concurrent drafts
    const running = await this.prisma.claimDraft.findFirst({
      where: { projectId, status: 'RUNNING' },
    });
    if (running) {
      throw new ConflictException(
        'A claim draft is already running for this project. Wait for it to complete or try again later.',
      );
    }

    const settings = await this.settingsService.getSettings();
    if (!settings.anthropicApiKey) {
      throw new NotFoundException('No Anthropic API key configured. Add one in Settings.');
    }

    // Enforce cost cap
    if (settings.costCapUsd > 0) {
      const stages = await this.prisma.feasibilityStage.findMany({
        where: { feasibilityRun: { projectId }, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const complianceChecks = await this.prisma.complianceCheck.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const prevApps = await this.prisma.patentApplication.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const prevDrafts = await this.prisma.claimDraft.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const spent =
        stages.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0) +
        complianceChecks.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0) +
        prevApps.reduce((sum, a) => sum + (a.estimatedCostUsd ?? 0), 0) +
        prevDrafts.reduce((sum, d) => sum + (d.estimatedCostUsd ?? 0), 0);
      if (spent >= settings.costCapUsd) {
        throw new BadRequestException(
          `Cost cap exceeded. You have spent $${spent.toFixed(2)} of your $${settings.costCapUsd.toFixed(2)} cap. ` +
            `Increase the cost cap in Settings to continue.`,
        );
      }
    }

    const { stage5, stage6, priorArtResults } = await this.getFeasibilityContext(projectId);

    const inv = project.invention;
    const narrative = [
      `Title: ${inv.title}`,
      `Description: ${inv.description}`,
      inv.problemSolved ? `Problem Solved: ${inv.problemSolved}` : '',
      inv.howItWorks ? `How It Works: ${inv.howItWorks}` : '',
      inv.aiComponents ? `AI/ML Components: ${inv.aiComponents}` : '',
      inv.threeDPrintComponents ? `3D Print Components: ${inv.threeDPrintComponents}` : '',
      inv.whatIsNovel ? `What Is Novel: ${inv.whatIsNovel}` : '',
      inv.currentAlternatives ? `Current Alternatives: ${inv.currentAlternatives}` : '',
      inv.whatIsBuilt ? `What Is Built: ${inv.whatIsBuilt}` : '',
      inv.whatToProtect ? `What To Protect: ${inv.whatToProtect}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const lastDraft = await this.prisma.claimDraft.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = (lastDraft?.version ?? 0) + 1;

    const draft = await this.prisma.claimDraft.create({
      data: {
        projectId,
        version,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    return {
      draftId: draft.id,
      requestBody: {
        invention_narrative: narrative,
        feasibility_stage_5: stage5,
        feasibility_stage_6: stage6,
        prior_art_results: priorArtResults,
        settings: {
          api_key: settings.anthropicApiKey,
          default_model: settings.defaultModel,
          research_model: settings.researchModel || '',
          max_tokens: settings.maxTokens,
        },
      },
    };
  }

  /**
   * Save results from an SSE `complete` event to the database.
   * Called by the controller's stream endpoint when the upstream sends a complete event.
   */
  async saveStreamComplete(draftId: string, payload: ClaimDrafterResponse) {
    if (payload.status === 'ERROR') {
      console.error(
        `[ClaimDraft] Claim drafter returned ERROR for ${draftId}: ${payload.error_message ?? 'no message'}`,
      );
      await this.prisma.claimDraft.update({
        where: { id: draftId },
        data: { status: 'ERROR', completedAt: new Date() },
      });
      return;
    }

    // Save claims to DB
    for (const claim of payload.claims || []) {
      await this.prisma.claim.create({
        data: {
          draftId,
          claimNumber: claim.claim_number,
          claimType: claim.claim_type,
          scopeLevel: claim.scope_level ?? null,
          statutoryType: claim.statutory_type ?? null,
          parentClaimNumber: claim.parent_claim_number ?? null,
          text: claim.text,
          examinerNotes: claim.examiner_notes ?? '',
        },
      });
    }

    await this.prisma.claimDraft.update({
      where: { id: draftId },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        specLanguage: payload.specification_language || null,
        plannerStrategy: payload.planner_strategy || null,
        examinerFeedback: payload.examiner_feedback || null,
        revisionNotes: payload.revision_notes || null,
        estimatedCostUsd: payload.total_estimated_cost_usd ?? null,
      },
    });
  }

  /**
   * Mark a draft as ERROR. Used by the stream endpoint on failure.
   */
  async markDraftError(draftId: string) {
    try {
      const current = await this.prisma.claimDraft.findUnique({ where: { id: draftId } });
      if (current && current.status === 'RUNNING') {
        await this.prisma.claimDraft.update({
          where: { id: draftId },
          data: { status: 'ERROR', completedAt: new Date() },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ClaimDraft] Failed to mark draft ${draftId} as error: ${msg}`);
    }
  }

  /**
   * Get the latest claim draft for a project.
   * When `full` is false (default), each claim includes a `preview` field
   * (first 200 chars of text) and omits the full `text` field — reducing
   * payload from ~150KB to ~15KB for large claim sets.
   * When `full` is true, the full `text` field is included (backwards compatible).
   */
  async getLatest(projectId: string, full = false) {
    const draft = await this.prisma.claimDraft.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      include: { claims: { orderBy: { claimNumber: 'asc' } } },
    });
    if (!draft) return { status: 'NONE', claims: [] };
    if (full) return draft;

    // Strip full text from claims and add preview
    const claims = draft.claims.map((c) => {
      const { text, ...rest } = c;
      return { ...rest, preview: text.slice(0, 200) };
    });
    return { ...draft, claims };
  }

  /**
   * Get the full text of a single claim.
   * Used by the frontend to lazy-load claim text when the user expands a claim.
   */
  async getClaimText(projectId: string, claimId: string): Promise<{ text: string }> {
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        draft: { projectId },
      },
      select: { text: true },
    });
    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found in project ${projectId}`);
    }
    return { text: claim.text };
  }

  /**
   * Get a specific claim draft version.
   */
  async getByVersion(projectId: string, version: number) {
    const draft = await this.prisma.claimDraft.findFirst({
      where: { projectId, version },
      include: { claims: { orderBy: { claimNumber: 'asc' } } },
    });
    if (!draft) throw new NotFoundException(`Claim draft version ${version} not found`);
    return draft;
  }

  /**
   * Regenerate a single claim by re-calling the claim drafter with focused instructions.
   */
  async regenerateClaim(projectId: string, claimNumber: number) {
    const draft = await this.prisma.claimDraft.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { claims: { orderBy: { claimNumber: 'asc' } } },
    });
    if (!draft) throw new NotFoundException('No completed claim draft found');

    const claim = draft.claims.find((c) => c.claimNumber === claimNumber);
    if (!claim) throw new NotFoundException(`Claim ${claimNumber} not found in latest draft`);

    const settings = await this.settingsService.getSettings();
    if (!settings.anthropicApiKey) {
      throw new NotFoundException('No Anthropic API key configured. Add one in Settings.');
    }

    // Build context: all claims text for reference
    const allClaimsText = draft.claims.map((c) => `${c.claimNumber}. ${c.text}`).join('\n\n');

    // Get invention narrative
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { invention: true },
    });
    const inv = project?.invention;
    const narrative = inv
      ? [`Title: ${inv.title}`, `Description: ${inv.description}`].filter(Boolean).join('\n\n')
      : '';

    // Fetch feasibility context so regenerated claims have the same novelty analysis
    const { stage5, stage6, priorArtResults } = await this.getFeasibilityContext(projectId);

    // Call claim drafter with regeneration instruction
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    const res = await fetch(`${CLAIM_DRAFTER_URL}/draft/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        invention_narrative: `REGENERATE CLAIM ${claimNumber} ONLY.\n\nContext — all current claims:\n${allClaimsText}\n\nInvention:\n${narrative}`,
        feasibility_stage_5: stage5,
        feasibility_stage_6: stage6,
        prior_art_results: priorArtResults,
        settings: {
          api_key: settings.anthropicApiKey,
          default_model: settings.defaultModel,
          research_model: settings.researchModel || '',
          max_tokens: settings.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Claim regeneration failed: ${text}`);
    }

    const result: ClaimDrafterResponse = await res.json();
    if (result.status === 'ERROR' || !result.claims?.length) {
      throw new BadRequestException('Claim regeneration produced no results');
    }

    // Find the matching claim number in the result, or take the first one
    const newClaim = result.claims.find((c) => c.claim_number === claimNumber) || result.claims[0];

    // Update claim text in DB
    return this.prisma.claim.update({
      where: { id: claim.id },
      data: { text: newClaim.text },
    });
  }

  /**
   * Update a claim's text (user editing).
   * Verifies the claim belongs to the given project before updating.
   */
  async updateClaim(projectId: string, claimId: string, text: string) {
    // Ownership check: claim → draft → project
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        draft: { projectId },
      },
    });
    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found in project ${projectId}`);
    }

    return this.prisma.claim.update({
      where: { id: claimId },
      data: { text },
    });
  }

  /**
   * Generate a DOCX buffer containing all claims from the latest COMPLETE draft.
   */
  async getDocxBuffer(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const draft = await this.prisma.claimDraft.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { claims: { orderBy: { claimNumber: 'asc' } } },
    });
    if (!draft || !draft.claims.length) {
      throw new NotFoundException('No completed claim draft found');
    }

    const independentClaims = draft.claims.filter((c) => c.claimType === 'INDEPENDENT');
    const dependentClaims = draft.claims.filter((c) => c.claimType === 'DEPENDENT');

    const paragraphs: Paragraph[] = [];

    // Title
    paragraphs.push(
      new Paragraph({
        text: `Patent Claim Drafts — ${project.title}`,
        heading: HeadingLevel.HEADING_1,
      }),
    );

    // UPL disclaimer
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'DRAFT — NOT FOR FILING. These are AI-generated research concepts. They must be reviewed by a registered patent attorney before any filing.',
            bold: true,
            color: 'B45309',
            size: 20,
          }),
        ],
      }),
    );
    paragraphs.push(new Paragraph({ text: '' }));

    // Independent claims first
    if (independentClaims.length > 0) {
      paragraphs.push(
        new Paragraph({
          text: 'Independent Claims',
          heading: HeadingLevel.HEADING_2,
        }),
      );

      for (const claim of independentClaims) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: `Claim ${claim.claimNumber} (Independent):`, bold: true })],
          }),
        );
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: claim.text })],
          }),
        );
        paragraphs.push(new Paragraph({ text: '' }));
      }
    }

    // Dependent claims
    if (dependentClaims.length > 0) {
      paragraphs.push(
        new Paragraph({
          text: 'Dependent Claims',
          heading: HeadingLevel.HEADING_2,
        }),
      );

      for (const claim of dependentClaims) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Claim ${claim.claimNumber} (Dependent on ${claim.parentClaimNumber}):`,
                bold: true,
              }),
            ],
          }),
        );
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: claim.text })],
          }),
        );
        paragraphs.push(new Paragraph({ text: '' }));
      }
    }

    // Legal disclaimer footer
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: '---', color: '6B7280', size: 16 })],
      }),
    );
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Disclaimer: ', bold: true, color: '6B7280', size: 16, font: 'Calibri' }),
          new TextRun({
            text: 'These claims were generated by PatentForge, an open-source AI-powered patent research tool. They are draft research concepts intended for discussion with a registered patent attorney. They do not constitute legal advice. Claims may be too broad, too narrow, or contain fabricated technical details. Every claim must be reviewed, revised, and finalized by a registered patent attorney before any filing.',
            color: '6B7280',
            size: 16,
            font: 'Calibri',
          }),
        ],
      }),
    );

    const draftHeader = new Header({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DRAFT — NOT LEGAL ADVICE — AI-GENERATED RESEARCH ONLY', color: 'B0B0B0', size: 16, font: 'Calibri', bold: true })] })],
    });
    const draftFooter = new Footer({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Generated by PatentForge · Not legal advice · Consult a patent attorney before acting', color: 'B0B0B0', size: 14, font: 'Calibri' })] })],
    });

    const doc = new Document({
      creator: 'PatentForge',
      title: `${project.title} — Claim Drafts`,
      sections: [{
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        headers: { default: draftHeader },
        footers: { default: draftFooter },
        children: paragraphs,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const slug = project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return { buffer, filename: `${slug}-claims.docx` };
  }
}
