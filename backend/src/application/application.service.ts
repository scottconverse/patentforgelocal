import * as http from 'http';
import { Injectable, NotFoundException, BadRequestException, ConflictException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

const APPLICATION_GENERATOR_URL = process.env.APPLICATION_GENERATOR_URL || 'http://localhost:3003';
const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ||
  (() => {
    console.warn(
      '[PatentForge] INTERNAL_SERVICE_SECRET is not set — using insecure default. ' +
        'Add it to backend/.env for any networked deployment. Generate one: openssl rand -hex 32',
    );
    return 'patentforge-internal';
  })();

/** Response from the Python application-generator /generate/sync endpoint. */
interface AppGeneratorResponse {
  status: string;
  error_message?: string;
  title?: string;
  abstract?: string | null;
  background?: string | null;
  summary?: string | null;
  detailed_description?: string | null;
  claims?: string | null;
  figure_descriptions?: string | null;
  cross_references?: string | null;
  ids_table?: string | null;
  total_estimated_cost_usd?: number | null;
}

/**
 * Valid section names that can be individually updated.
 * Maps section name to Prisma column name.
 */
const VALID_SECTIONS: Record<string, string> = {
  title: 'title',
  crossReferences: 'crossReferences',
  background: 'background',
  summary: 'summary',
  detailedDescription: 'detailedDescription',
  claims: 'claims',
  figureDescriptions: 'figureDescriptions',
  abstract: 'abstract',
  idsTable: 'idsTable',
};

/**
 * Request body sent to the Python application-generator service.
 * Must match the ApplicationGenerateRequest Pydantic model in services/application-generator/src/models.py.
 */
interface ApplicationGenerateRequestBody {
  invention_narrative: string;
  feasibility_stage_1: string;
  feasibility_stage_5: string;
  feasibility_stage_6: string;
  prior_art_results: Array<{
    patent_number: string;
    title: string;
    abstract: string | null;
    relevance_score: number;
    claims_text: string | null;
  }>;
  claims_text: string;
  spec_language: string;
  settings: {
    api_key: string;
    default_model: string;
    research_model: string;
    max_tokens: number;
  };
}

@Injectable()
export class ApplicationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * On service startup, mark any RUNNING applications from a previous crash as ERROR.
   * Prevents permanently stuck applications that block new runs via the concurrency guard.
   */
  async onModuleInit() {
    const { count } = await this.prisma.patentApplication.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'ERROR', errorMessage: 'Interrupted by server restart', completedAt: new Date() },
    });
    if (count > 0) {
      console.warn(`[Application] Cleaned up ${count} stuck RUNNING application(s) from previous session`);
    }
  }

  /**
   * Start a new patent application generation for a project.
   * Collects upstream artifacts (invention, feasibility, prior art, claims),
   * then calls the Python application-generator service.
   */
  async startGeneration(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { invention: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    if (!project.invention) throw new NotFoundException('No invention form — fill it in first');

    // Require at least one completed claim draft
    const completedClaims = await this.prisma.claimDraft.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { claims: { orderBy: { claimNumber: 'asc' } } },
    });
    if (!completedClaims) {
      throw new BadRequestException('No completed claim draft found. Run Claim Drafting first.');
    }

    // Prevent concurrent generations — only one RUNNING application per project
    const running = await this.prisma.patentApplication.findFirst({
      where: { projectId, status: 'RUNNING' },
    });
    if (running) {
      throw new ConflictException(
        'An application generation is already running for this project. Wait for it to complete or try again later.',
      );
    }

    const settings = await this.settingsService.getSettings();
    if (!settings.anthropicApiKey) {
      throw new NotFoundException('No Anthropic API key configured. Add one in Settings.');
    }

    // Enforce cost cap before starting application generation
    if (settings.costCapUsd > 0) {
      const stages = await this.prisma.feasibilityStage.findMany({
        where: {
          feasibilityRun: { projectId },
          estimatedCostUsd: { not: null },
        },
        select: { estimatedCostUsd: true },
      });
      const claimDrafts = await this.prisma.claimDraft.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      // Include compliance check costs
      const complianceChecks = await this.prisma.complianceCheck.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      // Include previous application generation costs
      const prevApps = await this.prisma.patentApplication.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
        select: { estimatedCostUsd: true },
      });
      const spent =
        stages.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0) +
        claimDrafts.reduce((sum, d) => sum + (d.estimatedCostUsd ?? 0), 0) +
        complianceChecks.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0) +
        prevApps.reduce((sum, a) => sum + (a.estimatedCostUsd ?? 0), 0);
      if (spent >= settings.costCapUsd) {
        throw new BadRequestException(
          `Cost cap exceeded. You have spent $${spent.toFixed(2)} of your $${settings.costCapUsd.toFixed(2)} cap. ` +
            `Increase the cost cap in Settings to continue.`,
        );
      }
    }

    // Get latest feasibility run
    const feasRun = await this.prisma.feasibilityRun.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { stages: { orderBy: { stageNumber: 'asc' } } },
    });

    // Truncate feasibility stages to keep the request under 30K chars per stage
    const MAX_STAGE_CHARS = 15_000;
    const rawStage1 = feasRun?.stages?.find((s) => s.stageNumber === 1)?.outputText ?? '';
    const rawStage5 = feasRun?.stages?.find((s) => s.stageNumber === 5)?.outputText ?? '';
    const rawStage6 = feasRun?.stages?.find((s) => s.stageNumber === 6)?.outputText ?? '';
    const stage1 =
      rawStage1.length > MAX_STAGE_CHARS
        ? rawStage1.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for application generation context]'
        : rawStage1;
    const stage5 =
      rawStage5.length > MAX_STAGE_CHARS
        ? rawStage5.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for application generation context]'
        : rawStage5;
    const stage6 =
      rawStage6.length > MAX_STAGE_CHARS
        ? rawStage6.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for application generation context]'
        : rawStage6;

    // Get prior art results (top 20) with cached claims text
    const priorArt = await this.prisma.priorArtSearch.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { results: { orderBy: { relevanceScore: 'desc' }, take: 20 } },
    });

    const priorArtResults: Array<{
      patent_number: string;
      title: string;
      abstract: string | null;
      relevance_score: number;
      claims_text: string | null;
    }> = [];
    if (!priorArt || !priorArt.results || priorArt.results.length === 0) {
      console.warn(`[Application] No completed prior art search found for project ${projectId}. IDS will be empty.`);
    }
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

    // Format claims text from latest completed draft
    const claimsText = completedClaims.claims.map((c) => `${c.claimNumber}. ${c.text}`).join('\n\n');

    // Get spec language from the claim draft (if the claim-drafter produced one)
    const specLanguage = completedClaims.specLanguage ?? '';

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

    // Determine version number
    const lastApp = await this.prisma.patentApplication.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = (lastApp?.version ?? 0) + 1;

    // Create application record
    const app = await this.prisma.patentApplication.create({
      data: {
        projectId,
        version,
        status: 'RUNNING',
      },
    });

    // Fire async IIFE — frontend polls for status
    // finally block guarantees application status is resolved even if error handling itself fails
    (async () => {
      try {
        await this.callApplicationGenerator(app.id, {
          invention_narrative: narrative,
          feasibility_stage_1: stage1,
          feasibility_stage_5: stage5,
          feasibility_stage_6: stage6,
          prior_art_results: priorArtResults,
          claims_text: claimsText,
          spec_language: specLanguage,
          settings: {
            api_key: settings.anthropicApiKey,
            default_model: settings.defaultModel,
            research_model: settings.researchModel || '',
            max_tokens: settings.maxTokens,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Application] Pipeline failed for application ${app.id}:`, msg);
      } finally {
        // Ensure application is never left in RUNNING status
        const current = await this.prisma.patentApplication.findUnique({ where: { id: app.id } });
        if (current && current.status === 'RUNNING') {
          await this.prisma.patentApplication
            .update({
              where: { id: app.id },
              data: { status: 'ERROR', errorMessage: 'Pipeline did not complete', completedAt: new Date() },
            })
            .catch((e) => console.error(`[Application] Failed to update application status: ${e.message}`));
        }
      }
    })();

    return app;
  }

  /**
   * Call the Python application-generator service and save results.
   */
  private async callApplicationGenerator(appId: string, requestBody: ApplicationGenerateRequestBody) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    // Use http.request for full timeout control — fetch has a ~5 min socket timeout
    // that can't be overridden, but AI application generation takes 10-15 minutes.
    const result = await new Promise<AppGeneratorResponse>((resolve, reject) => {
      const url = new URL(`${APPLICATION_GENERATOR_URL}/generate/sync`);

      const data = JSON.stringify(requestBody);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
          timeout: 900_000, // 15 minutes — application generation with large context can take 10+ min
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (res.statusCode !== 200) {
              reject(new Error(`Application generator returned ${res.statusCode}: ${body}`));
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error(`Invalid JSON from application generator: ${body.slice(0, 200)}`));
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Application generator request timed out (15 min)'));
      });
      req.on('error', (e: Error) => reject(new Error(`Application generator request failed: ${e.message}`)));
      req.write(data);
      req.end();
    });

    if (result.status === 'ERROR') {
      console.error(`[Application] Generator returned ERROR for ${appId}: ${result.error_message ?? 'no message'}`);
      await this.prisma.patentApplication.update({
        where: { id: appId },
        data: {
          status: 'ERROR',
          errorMessage: result.error_message ?? 'Application generator returned an error',
          completedAt: new Date(),
        },
      });
      return;
    }

    // Save all section fields + metadata
    await this.prisma.patentApplication.update({
      where: { id: appId },
      data: {
        status: 'COMPLETE',
        title: result.title || requestBody.invention_narrative.split('\n')[0].replace(/^Title:\s*/i, '') || null,
        abstract: result.abstract ?? null,
        background: result.background ?? null,
        summary: result.summary ?? null,
        detailedDescription: result.detailed_description ?? null,
        claims: result.claims ?? null,
        figureDescriptions: result.figure_descriptions ?? null,
        crossReferences: result.cross_references ?? null,
        idsTable: result.ids_table ?? null,
        estimatedCostUsd: result.total_estimated_cost_usd ?? null,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Prepare an application generation for streaming: validates the project, enforces
   * concurrency and cost cap, builds the request body, and creates the RUNNING record.
   * Returns the appId and the request body to send to the upstream service.
   * Used by the controller's SSE stream endpoint.
   */
  async prepareGeneration(projectId: string): Promise<{ appId: string; requestBody: ApplicationGenerateRequestBody }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { invention: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    if (!project.invention) throw new NotFoundException('No invention form — fill it in first');

    const completedClaims = await this.prisma.claimDraft.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { claims: { orderBy: { claimNumber: 'asc' } } },
    });
    if (!completedClaims) {
      throw new BadRequestException('No completed claim draft found. Run Claim Drafting first.');
    }

    const running = await this.prisma.patentApplication.findFirst({
      where: { projectId, status: 'RUNNING' },
    });
    if (running) {
      throw new ConflictException(
        'An application generation is already running for this project. Wait for it to complete or try again later.',
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
      const claimDrafts = await this.prisma.claimDraft.findMany({
        where: { projectId, estimatedCostUsd: { not: null } },
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
      const spent =
        stages.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0) +
        claimDrafts.reduce((sum, d) => sum + (d.estimatedCostUsd ?? 0), 0) +
        complianceChecks.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0) +
        prevApps.reduce((sum, a) => sum + (a.estimatedCostUsd ?? 0), 0);
      if (spent >= settings.costCapUsd) {
        throw new BadRequestException(
          `Cost cap exceeded. You have spent $${spent.toFixed(2)} of your $${settings.costCapUsd.toFixed(2)} cap. ` +
            `Increase the cost cap in Settings to continue.`,
        );
      }
    }

    const feasRun = await this.prisma.feasibilityRun.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { stages: { orderBy: { stageNumber: 'asc' } } },
    });

    const MAX_STAGE_CHARS = 15_000;
    const rawStage1 = feasRun?.stages?.find((s) => s.stageNumber === 1)?.outputText ?? '';
    const rawStage5 = feasRun?.stages?.find((s) => s.stageNumber === 5)?.outputText ?? '';
    const rawStage6 = feasRun?.stages?.find((s) => s.stageNumber === 6)?.outputText ?? '';
    const stage1 = rawStage1.length > MAX_STAGE_CHARS
      ? rawStage1.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for application generation context]'
      : rawStage1;
    const stage5 = rawStage5.length > MAX_STAGE_CHARS
      ? rawStage5.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for application generation context]'
      : rawStage5;
    const stage6 = rawStage6.length > MAX_STAGE_CHARS
      ? rawStage6.slice(0, MAX_STAGE_CHARS) + '\n\n[...truncated for application generation context]'
      : rawStage6;

    const priorArt = await this.prisma.priorArtSearch.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { results: { orderBy: { relevanceScore: 'desc' }, take: 20 } },
    });

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

    const claimsText = completedClaims.claims.map((c) => `${c.claimNumber}. ${c.text}`).join('\n\n');
    const specLanguage = completedClaims.specLanguage ?? '';

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

    const lastApp = await this.prisma.patentApplication.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = (lastApp?.version ?? 0) + 1;

    const app = await this.prisma.patentApplication.create({
      data: {
        projectId,
        version,
        status: 'RUNNING',
      },
    });

    return {
      appId: app.id,
      requestBody: {
        invention_narrative: narrative,
        feasibility_stage_1: stage1,
        feasibility_stage_5: stage5,
        feasibility_stage_6: stage6,
        prior_art_results: priorArtResults,
        claims_text: claimsText,
        spec_language: specLanguage,
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
  async saveStreamComplete(appId: string, payload: AppGeneratorResponse) {
    if (payload.status === 'ERROR') {
      console.error(`[Application] Generator returned ERROR for ${appId}: ${payload.error_message ?? 'no message'}`);
      await this.prisma.patentApplication.update({
        where: { id: appId },
        data: {
          status: 'ERROR',
          errorMessage: payload.error_message ?? 'Application generator returned an error',
          completedAt: new Date(),
        },
      });
      return;
    }

    await this.prisma.patentApplication.update({
      where: { id: appId },
      data: {
        status: 'COMPLETE',
        title: payload.title || null,
        abstract: payload.abstract ?? null,
        background: payload.background ?? null,
        summary: payload.summary ?? null,
        detailedDescription: payload.detailed_description ?? null,
        claims: payload.claims ?? null,
        figureDescriptions: payload.figure_descriptions ?? null,
        crossReferences: payload.cross_references ?? null,
        idsTable: payload.ids_table ?? null,
        estimatedCostUsd: payload.total_estimated_cost_usd ?? null,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Mark an application as ERROR. Used by the stream endpoint on failure.
   */
  async markAppError(appId: string) {
    try {
      const current = await this.prisma.patentApplication.findUnique({ where: { id: appId } });
      if (current && current.status === 'RUNNING') {
        await this.prisma.patentApplication.update({
          where: { id: appId },
          data: { status: 'ERROR', errorMessage: 'Stream did not complete', completedAt: new Date() },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Application] Failed to mark app ${appId} as error: ${msg}`);
    }
  }

  /**
   * Get the latest patent application for a project.
   */
  async getLatest(projectId: string) {
    const app = await this.prisma.patentApplication.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    return app || { status: 'NONE' };
  }

  /**
   * Get a specific application version.
   */
  async getByVersion(projectId: string, version: number) {
    const app = await this.prisma.patentApplication.findFirst({
      where: { projectId, version },
    });
    if (!app) throw new NotFoundException(`Application version ${version} not found`);
    return app;
  }

  /**
   * Update a single section on the latest application.
   */
  async updateSection(projectId: string, sectionName: string, text: string) {
    const column = VALID_SECTIONS[sectionName];
    if (!column) {
      throw new BadRequestException(
        `Invalid section name "${sectionName}". Valid names: ${Object.keys(VALID_SECTIONS).join(', ')}`,
      );
    }

    const app = await this.prisma.patentApplication.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    if (!app) throw new NotFoundException('No application found for this project');

    return this.prisma.patentApplication.update({
      where: { id: app.id },
      data: { [column]: text },
    });
  }

  /**
   * Export the latest application as a DOCX buffer by calling the Python service.
   */
  async getDocxBuffer(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const app = await this.prisma.patentApplication.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
    });
    if (!app) throw new NotFoundException('No completed application found');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    const sectionData = {
      title: app.title ?? '',
      cross_references: app.crossReferences ?? '',
      background: app.background ?? '',
      summary: app.summary ?? '',
      detailed_description: app.detailedDescription ?? '',
      claims: app.claims ?? '',
      figure_descriptions: app.figureDescriptions ?? '',
      abstract: app.abstract ?? '',
      ids_table: app.idsTable ?? '',
    };

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const url = new URL(`${APPLICATION_GENERATOR_URL}/export/docx`);

      const data = JSON.stringify(sectionData);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
          timeout: 60_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(
                new Error(`DOCX export returned ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 200)}`),
              );
              return;
            }
            resolve(Buffer.concat(chunks));
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('DOCX export request timed out'));
      });
      req.on('error', (e: Error) => reject(new Error(`DOCX export request failed: ${e.message}`)));
      req.write(data);
      req.end();
    });

    const slug = project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return { buffer, filename: `${slug}-application.docx` };
  }

  /**
   * Export the latest application as markdown by calling the Python service.
   */
  async getMarkdown(projectId: string): Promise<{ text: string; filename: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const app = await this.prisma.patentApplication.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
    });
    if (!app) throw new NotFoundException('No completed application found');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    const sectionData = {
      title: app.title ?? '',
      cross_references: app.crossReferences ?? '',
      background: app.background ?? '',
      summary: app.summary ?? '',
      detailed_description: app.detailedDescription ?? '',
      claims: app.claims ?? '',
      figure_descriptions: app.figureDescriptions ?? '',
      abstract: app.abstract ?? '',
      ids_table: app.idsTable ?? '',
    };

    const text = await new Promise<string>((resolve, reject) => {
      const url = new URL(`${APPLICATION_GENERATOR_URL}/export/markdown`);

      const data = JSON.stringify(sectionData);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
          timeout: 60_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (res.statusCode !== 200) {
              reject(new Error(`Markdown export returned ${res.statusCode}: ${body.slice(0, 200)}`));
              return;
            }
            resolve(body);
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Markdown export request timed out'));
      });
      req.on('error', (e: Error) => reject(new Error(`Markdown export request failed: ${e.message}`)));
      req.write(data);
      req.end();
    });

    const slug = project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return { text, filename: `${slug}-application.md` };
  }
}
