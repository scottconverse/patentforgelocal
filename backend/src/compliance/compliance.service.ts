import * as http from 'http';
import { Injectable, NotFoundException, BadRequestException, ConflictException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Header, Footer, AlignmentType } from 'docx';

/** A single compliance result from the Python compliance-checker. */
interface ComplianceCheckerResult {
  rule: string;
  status: string;
  claim_number?: number | null;
  detail: string;
  citation?: string | null;
  suggestion?: string | null;
}

/** Response from the Python compliance-checker /check endpoint. */
interface ComplianceCheckerResponse {
  status: string;
  results: ComplianceCheckerResult[];
  total_estimated_cost_usd?: number | null;
}

const COMPLIANCE_CHECKER_URL = process.env.COMPLIANCE_CHECKER_URL || 'http://localhost:3004';
const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ||
  (() => {
    console.warn(
      '[PatentForge] INTERNAL_SERVICE_SECRET is not set — using insecure default. ' +
        'Add it to backend/.env for any networked deployment. Generate one: openssl rand -hex 32',
    );
    return 'patentforge-internal';
  })();

/**
 * Request body sent to the Python compliance-checker service.
 * Must match the ComplianceRequest Pydantic model in services/compliance-checker/src/models.py.
 */
interface ComplianceCheckRequestBody {
  claims: Array<{
    claim_number: number;
    claim_type: string;
    parent_claim_number: number | null;
    text: string;
  }>;
  specification_text: string;
  invention_narrative: string;
  prior_art_context: string;
  settings: {
    api_key: string;
    default_model: string;
    research_model: string;
    max_tokens: number;
  };
}

@Injectable()
export class ComplianceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * On startup, mark any RUNNING checks from a previous crash as ERROR.
   */
  async onModuleInit() {
    const { count } = await this.prisma.complianceCheck.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'ERROR', completedAt: new Date() },
    });
    if (count > 0) {
      console.warn(`[Compliance] Cleaned up ${count} stuck RUNNING check(s) from previous session`);
    }
  }

  /**
   * Start a compliance check for a project's claims.
   */
  async startCheck(projectId: string, draftVersion?: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { invention: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    // Get the claim draft (specific version or latest)
    const draft = draftVersion
      ? await this.prisma.claimDraft.findFirst({
          where: { projectId, version: draftVersion, status: 'COMPLETE' },
          include: { claims: { orderBy: { claimNumber: 'asc' } } },
        })
      : await this.prisma.claimDraft.findFirst({
          where: { projectId, status: 'COMPLETE' },
          orderBy: { version: 'desc' },
          include: { claims: { orderBy: { claimNumber: 'asc' } } },
        });

    if (!draft || !draft.claims.length) {
      throw new NotFoundException('No completed claim draft found. Generate claims first.');
    }

    // Prevent concurrent checks
    const running = await this.prisma.complianceCheck.findFirst({
      where: { projectId, status: 'RUNNING' },
    });
    if (running) {
      throw new ConflictException('A compliance check is already running for this project.');
    }

    const settings = await this.settingsService.getSettings();
    if (!settings.anthropicApiKey) {
      throw new NotFoundException('No Anthropic API key configured. Add one in Settings.');
    }

    // Enforce cost cap — aggregate ALL pipeline costs
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
      const spent =
        stages.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0) +
        complianceChecks.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0) +
        prevApps.reduce((sum, a) => sum + (a.estimatedCostUsd ?? 0), 0);
      if (spent >= settings.costCapUsd) {
        throw new BadRequestException(
          `Cost cap exceeded. You have spent $${spent.toFixed(2)} of your $${settings.costCapUsd.toFixed(2)} cap. ` +
            `Increase the cost cap in Settings to continue.`,
        );
      }
    }

    // Build invention narrative
    const inv = project.invention;
    const narrative = inv
      ? [
          `Title: ${inv.title}`,
          `Description: ${inv.description}`,
          inv.problemSolved ? `Problem Solved: ${inv.problemSolved}` : '',
          inv.howItWorks ? `How It Works: ${inv.howItWorks}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';

    // Get specification text from feasibility Stage 1
    const feasRun = await this.prisma.feasibilityRun.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { stages: { where: { stageNumber: 1 }, take: 1 } },
    });
    const specText = feasRun?.stages?.[0]?.outputText ?? '';

    // Create compliance check record
    const lastCheck = await this.prisma.complianceCheck.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = (lastCheck?.version ?? 0) + 1;

    const check = await this.prisma.complianceCheck.create({
      data: {
        projectId,
        version,
        status: 'RUNNING',
        draftVersion: draft.version,
        startedAt: new Date(),
      },
    });

    // Fire and forget -- frontend polls for status
    // finally block guarantees check status is resolved even if error handling itself fails
    (async () => {
      try {
        await this.callComplianceChecker(check.id, {
          claims: draft.claims.map((c) => {
            if (c.text.length > 10_000) {
              console.warn(
                `[Compliance] Claim ${c.claimNumber} text is ${c.text.length} chars — may cause validation issues`,
              );
            }
            return {
              claim_number: c.claimNumber,
              claim_type: c.claimType,
              parent_claim_number: c.parentClaimNumber,
              text: c.text.slice(0, 10_000), // Safety cap
            };
          }),
          specification_text: specText,
          invention_narrative: narrative,
          prior_art_context: '',
          settings: {
            api_key: settings.anthropicApiKey,
            default_model: settings.defaultModel,
            research_model: settings.researchModel || '',
            max_tokens: settings.maxTokens,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Compliance] Check failed for ${check.id}:`, msg);
      } finally {
        // Ensure check is never left in RUNNING status
        const current = await this.prisma.complianceCheck.findUnique({ where: { id: check.id } });
        if (current && current.status === 'RUNNING') {
          await this.prisma.complianceCheck
            .update({
              where: { id: check.id },
              data: { status: 'ERROR', completedAt: new Date() },
            })
            .catch((e) => console.error(`[Compliance] Failed to update check status: ${e.message}`));
        }
      }
    })();

    return check;
  }

  /**
   * Call the Python compliance-checker service and save results.
   */
  private async callComplianceChecker(checkId: string, requestBody: ComplianceCheckRequestBody) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    // Use http.request for full timeout control — fetch has a ~5 min socket timeout
    const result = await new Promise<ComplianceCheckerResponse>((resolve, reject) => {
      const url = new URL(`${COMPLIANCE_CHECKER_URL}/check`);

      const data = JSON.stringify(requestBody);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
          timeout: 600_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (res.statusCode !== 200) {
              reject(new Error(`Compliance checker returned ${res.statusCode}: ${body}`));
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error(`Invalid JSON from compliance checker`));
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Compliance check timed out (10 min)'));
      });
      req.on('error', (e: Error) => reject(new Error(`Compliance checker request failed: ${e.message}`)));
      req.write(data);
      req.end();
    });

    if (result.status === 'ERROR') {
      await this.prisma.complianceCheck.update({
        where: { id: checkId },
        data: { status: 'ERROR', completedAt: new Date() },
      });
      return;
    }

    // Save results to DB
    for (const r of result.results) {
      await this.prisma.complianceResult.create({
        data: {
          checkId,
          rule: r.rule,
          status: r.status,
          claimNumber: r.claim_number ?? null,
          detail: r.detail,
          citation: r.citation ?? null,
          suggestion: r.suggestion ?? null,
        },
      });
    }

    // Update check status with cost
    const hasFailure = result.results.some((r) => r.status === 'FAIL');
    await this.prisma.complianceCheck.update({
      where: { id: checkId },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        overallPass: !hasFailure,
        estimatedCostUsd: result.total_estimated_cost_usd ?? null,
      },
    });
  }

  /**
   * Prepare a compliance check for streaming: validates the project, enforces concurrency
   * and cost cap, builds the request body, and creates the RUNNING check record.
   * Returns the checkId and the request body to send to the upstream service.
   * Used by the controller's SSE stream endpoint.
   */
  async prepareCheck(projectId: string, draftVersion?: number): Promise<{ checkId: string; requestBody: ComplianceCheckRequestBody }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { invention: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const draft = draftVersion
      ? await this.prisma.claimDraft.findFirst({
          where: { projectId, version: draftVersion, status: 'COMPLETE' },
          include: { claims: { orderBy: { claimNumber: 'asc' } } },
        })
      : await this.prisma.claimDraft.findFirst({
          where: { projectId, status: 'COMPLETE' },
          orderBy: { version: 'desc' },
          include: { claims: { orderBy: { claimNumber: 'asc' } } },
        });

    if (!draft || !draft.claims.length) {
      throw new NotFoundException('No completed claim draft found. Generate claims first.');
    }

    const running = await this.prisma.complianceCheck.findFirst({
      where: { projectId, status: 'RUNNING' },
    });
    if (running) {
      throw new ConflictException('A compliance check is already running for this project.');
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
      const spent =
        stages.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0) +
        complianceChecks.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0) +
        prevApps.reduce((sum, a) => sum + (a.estimatedCostUsd ?? 0), 0);
      if (spent >= settings.costCapUsd) {
        throw new BadRequestException(
          `Cost cap exceeded. You have spent $${spent.toFixed(2)} of your $${settings.costCapUsd.toFixed(2)} cap. ` +
            `Increase the cost cap in Settings to continue.`,
        );
      }
    }

    const inv = project.invention;
    const narrative = inv
      ? [
          `Title: ${inv.title}`,
          `Description: ${inv.description}`,
          inv.problemSolved ? `Problem Solved: ${inv.problemSolved}` : '',
          inv.howItWorks ? `How It Works: ${inv.howItWorks}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';

    const feasRun = await this.prisma.feasibilityRun.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { stages: { where: { stageNumber: 1 }, take: 1 } },
    });
    const specText = feasRun?.stages?.[0]?.outputText ?? '';

    const lastCheck = await this.prisma.complianceCheck.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = (lastCheck?.version ?? 0) + 1;

    const check = await this.prisma.complianceCheck.create({
      data: {
        projectId,
        version,
        status: 'RUNNING',
        draftVersion: draft.version,
        startedAt: new Date(),
      },
    });

    return {
      checkId: check.id,
      requestBody: {
        claims: draft.claims.map((c) => ({
          claim_number: c.claimNumber,
          claim_type: c.claimType,
          parent_claim_number: c.parentClaimNumber,
          text: c.text.slice(0, 10_000),
        })),
        specification_text: specText,
        invention_narrative: narrative,
        prior_art_context: '',
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
  async saveStreamComplete(checkId: string, payload: ComplianceCheckerResponse) {
    if (payload.status === 'ERROR') {
      await this.prisma.complianceCheck.update({
        where: { id: checkId },
        data: { status: 'ERROR', completedAt: new Date() },
      });
      return;
    }

    for (const r of payload.results) {
      await this.prisma.complianceResult.create({
        data: {
          checkId,
          rule: r.rule,
          status: r.status,
          claimNumber: r.claim_number ?? null,
          detail: r.detail,
          citation: r.citation ?? null,
          suggestion: r.suggestion ?? null,
        },
      });
    }

    const hasFailure = payload.results.some((r) => r.status === 'FAIL');
    await this.prisma.complianceCheck.update({
      where: { id: checkId },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        overallPass: !hasFailure,
        estimatedCostUsd: payload.total_estimated_cost_usd ?? null,
      },
    });
  }

  /**
   * Mark a compliance check as ERROR. Used by the stream endpoint on failure.
   */
  async markCheckError(checkId: string) {
    try {
      const current = await this.prisma.complianceCheck.findUnique({ where: { id: checkId } });
      if (current && current.status === 'RUNNING') {
        await this.prisma.complianceCheck.update({
          where: { id: checkId },
          data: { status: 'ERROR', completedAt: new Date() },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Compliance] Failed to mark check ${checkId} as error: ${msg}`);
    }
  }

  /**
   * Get the latest compliance check for a project.
   */
  async getLatest(projectId: string) {
    const check = await this.prisma.complianceCheck.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      include: { results: true },
    });
    return check || { status: 'NONE', results: [] };
  }

  /**
   * Get a specific compliance check version.
   */
  async getByVersion(projectId: string, version: number) {
    const check = await this.prisma.complianceCheck.findFirst({
      where: { projectId, version },
      include: { results: true },
    });
    if (!check) throw new NotFoundException(`Compliance check version ${version} not found`);
    return check;
  }

  /**
   * Generate a DOCX buffer containing compliance check results.
   */
  async getDocxBuffer(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const check = await this.prisma.complianceCheck.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { results: true },
    });
    if (!check || !check.results.length) {
      throw new NotFoundException('No completed compliance check found');
    }

    const RULE_LABELS: Record<string, string> = {
      '112a_written_description': '112(a) Written Description',
      '112b_definiteness': '112(b) Definiteness',
      mpep_608_formalities: 'MPEP 608 Formalities',
      '101_eligibility': '101 Eligibility',
    };

    const paragraphs: Paragraph[] = [];

    // Title
    paragraphs.push(
      new Paragraph({
        text: `Compliance Check Results — ${project.title}`,
        heading: HeadingLevel.HEADING_1,
      }),
    );

    // UPL disclaimer
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'RESEARCH OUTPUT — NOT LEGAL ADVICE. This is an AI-generated compliance pre-screen. It must be reviewed by a registered patent attorney.',
            bold: true,
            color: 'B45309',
            size: 20,
          }),
        ],
      }),
    );
    paragraphs.push(new Paragraph({ text: '' }));

    // Overall status
    const hasFailure = check.results.some((r) => r.status === 'FAIL');
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: hasFailure ? 'Overall: ISSUES FOUND' : 'Overall: ALL CHECKS PASSED',
            bold: true,
            color: hasFailure ? 'DC2626' : '16A34A',
            size: 24,
          }),
        ],
      }),
    );
    paragraphs.push(new Paragraph({ text: '' }));

    // Group results by rule
    const grouped: Record<string, typeof check.results> = {};
    for (const r of check.results) {
      if (!grouped[r.rule]) grouped[r.rule] = [];
      grouped[r.rule].push(r);
    }

    for (const [rule, results] of Object.entries(grouped)) {
      const label = RULE_LABELS[rule] || rule;
      paragraphs.push(
        new Paragraph({
          text: label,
          heading: HeadingLevel.HEADING_2,
        }),
      );

      for (const r of results) {
        const statusLabel = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'WARN';
        const statusColor = r.status === 'PASS' ? '16A34A' : r.status === 'FAIL' ? 'DC2626' : 'CA8A04';

        // Status + claim number + detail
        const runs: TextRun[] = [new TextRun({ text: `[${statusLabel}]`, bold: true, color: statusColor })];
        if (r.claimNumber != null) {
          runs.push(new TextRun({ text: ` Claim ${r.claimNumber}:` }));
        }
        runs.push(new TextRun({ text: ` ${r.detail}` }));
        paragraphs.push(new Paragraph({ children: runs }));

        // Citation
        if (r.citation) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: `Citation: ${r.citation}`, italics: true, color: '6B7280', size: 18 })],
            }),
          );
        }

        // Suggestion
        if (r.suggestion) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: `Suggestion: ${r.suggestion}`, color: '3B82F6', size: 18 })],
            }),
          );
        }

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
            text: 'This compliance check was generated by PatentForge, an open-source AI-powered patent research tool. It is an AI-generated pre-screen intended for discussion with a registered patent attorney. It does not constitute legal advice. Results may contain false positives or negatives, and MPEP citations may be outdated or inaccurate. Every result must be reviewed by a registered patent attorney.',
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
      title: `${project.title} — Compliance Check`,
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
    return { buffer, filename: `${slug}-compliance.docx` };
  }
}
