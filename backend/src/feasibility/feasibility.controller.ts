import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FeasibilityService } from './feasibility.service';
import { SettingsService } from '../settings/settings.service';

const FEASIBILITY_URL = process.env.FEASIBILITY_URL || 'http://localhost:3001';
const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ||
  (() => {
    console.warn(
      '[PatentForgeLocal] INTERNAL_SERVICE_SECRET is not set — using insecure default. ' +
        'Add it to backend/.env for any networked deployment. Generate one: openssl rand -hex 32',
    );
    return '';
  })();
import { PriorArtService } from '../prior-art/prior-art.service';
import { PatchStageDto } from './dto/patch-stage.dto';
import { PatchRunDto } from './dto/patch-run.dto';
import { StartRunDto } from './dto/start-run.dto';
import { RerunFromStageDto } from './dto/rerun-from-stage.dto';
import { countWords } from '../utils/word-count';

@Controller('projects/:id/feasibility')
export class FeasibilityController {
  constructor(
    private readonly feasibilityService: FeasibilityService,
    private readonly settingsService: SettingsService,
    private readonly priorArtService: PriorArtService,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.CREATED)
  async startRun(@Param('id') projectId: string, @Body() body: StartRunDto) {
    // Enforce minimum invention description length before starting
    const description = await this.feasibilityService.getInventionDescription(projectId);
    const wordCount = description ? countWords(description) : 0;
    if (wordCount < 50) {
      throw new BadRequestException(
        `Invention description must be at least 50 words before running feasibility analysis. Current word count: ${wordCount}.`,
      );
    }

    const settings = await this.settingsService.getSettings();

    const run = await this.feasibilityService.startRun(projectId);
    // Kick off prior art search in background (non-blocking)
    if (body?.narrative) {
      this.priorArtService.startSearch(
        projectId,
        run.id,
        body.narrative,
        settings.ollamaUrl || 'http://127.0.0.1:11434',
        settings.defaultModel || 'gemma4:e4b',
        settings.usptoApiKey || undefined,
      );
    }
    return run;
  }

  @Get()
  getLatest(@Param('id') projectId: string) {
    return this.feasibilityService.getLatest(projectId);
  }

  @Get('runs')
  getAllRuns(@Param('id') projectId: string) {
    return this.feasibilityService.getAllRuns(projectId);
  }

  @Get('export/docx')
  async exportToDocx(@Param('id') projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.feasibilityService.getDocxBuffer(projectId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('report')
  getReport(@Param('id') projectId: string) {
    return this.feasibilityService.getReportText(projectId);
  }

  @Get('report/html')
  async getReportHtml(@Param('id') projectId: string, @Res() res: Response) {
    const html = await this.feasibilityService.getReportHtmlPage(projectId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('export/html')
  async exportToHtml(@Param('id') projectId: string, @Res() res: Response) {
    const html = await this.feasibilityService.getReportHtmlPage(projectId);
    const project = await this.feasibilityService.getProjectTitle(projectId);
    const slug = project
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-feasibility.html"`);
    res.send(html);
  }

  @Get('cost-estimate')
  getCostEstimate(@Param('id') projectId: string) {
    return this.feasibilityService.getCostEstimate(projectId);
  }

  @Get(':version')
  getByVersion(@Param('id') projectId: string, @Param('version', ParseIntPipe) version: number) {
    return this.feasibilityService.getByVersion(projectId, version);
  }

  @Patch('run')
  @HttpCode(HttpStatus.OK)
  patchRun(@Param('id') projectId: string, @Body() dto: PatchRunDto) {
    return this.feasibilityService.patchRun(projectId, dto);
  }

  @Patch('stages/:stageNumber')
  async patchStage(
    @Param('id') projectId: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() dto: PatchStageDto,
  ) {
    return this.feasibilityService.patchStage(projectId, stageNumber, dto);
  }

  /**
   * SSE proxy — forwards the analysis request to the feasibility service
   * and streams the response back to the browser. This keeps the feasibility
   * service internal (not directly reachable from the browser).
   */
  @Post('stream')
  async streamAnalysis(@Param('id') projectId: string, @Body() body: Record<string, unknown>, @Res() res: Response) {
    // Inject the API key server-side — never trust the frontend to send it
    const settings = await this.settingsService.getSettings();

    const bodySettings = (body.settings && typeof body.settings === 'object') ? body.settings as Record<string, unknown> : {};
    const forwardBody = {
      ...body,
      settings: {
        ...bodySettings,
        ollamaUrl: settings.ollamaUrl || 'http://127.0.0.1:11434',
      },
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    try {
      const upstream = await fetch(`${FEASIBILITY_URL}/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify(forwardBody),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        res.status(upstream.status).json({ error: text });
        return;
      }

      // Set SSE headers and pipe the upstream response body through
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SSE] Stream error:', message);
        if (!res.writableEnded) {
          try {
            res.write(
              `event: pipeline_error\ndata: ${JSON.stringify({ error: 'Stream interrupted. Check service logs.' })}\n\n`,
            );
          } catch {
            // Response already closed
          }
        }
      } finally {
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Feasibility service unavailable: ${message}` });
    }
  }

  @Post('rerun')
  @HttpCode(HttpStatus.CREATED)
  async rerunFromStage(@Param('id') projectId: string, @Body() dto: RerunFromStageDto) {
    return this.feasibilityService.rerunFromStage(projectId, dto.fromStage);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancelRun(@Param('id') projectId: string) {
    return this.feasibilityService.cancelRun(projectId);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  async exportReportToDisk(@Param('id') projectId: string) {
    const settings = await this.settingsService.getSettings();
    return this.feasibilityService.exportReportToDisk(projectId, settings.exportPath);
  }
}
