import { Controller, Get, Post, Param, Body, ParseIntPipe, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { ComplianceService } from './compliance.service';
import { StartComplianceDto } from './dto/start-compliance.dto';
import { SettingsService } from '../settings/settings.service';

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

@Controller('projects/:id/compliance')
export class ComplianceController {
  constructor(
    private readonly service: ComplianceService,
    private readonly settingsService: SettingsService,
  ) {}

  /** POST /api/projects/:id/compliance/check -- Start compliance check */
  @Post('check')
  @HttpCode(HttpStatus.CREATED)
  startCheck(@Param('id') projectId: string, @Body() dto: StartComplianceDto) {
    return this.service.startCheck(projectId, dto.draftVersion);
  }

  /** GET /api/projects/:id/compliance -- Get latest compliance check */
  @Get()
  getLatest(@Param('id') projectId: string) {
    return this.service.getLatest(projectId);
  }

  /** GET /api/projects/:id/compliance/export/docx -- Export compliance results as Word document */
  @Get('export/docx')
  async exportToDocx(@Param('id') projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.service.getDocxBuffer(projectId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** GET /api/projects/:id/compliance/:version -- Get specific version */
  @Get(':version')
  getByVersion(@Param('id') projectId: string, @Param('version', ParseIntPipe) version: number) {
    return this.service.getByVersion(projectId, version);
  }

  /**
   * SSE proxy — creates a compliance check record, forwards the request to the
   * Python compliance-checker SSE endpoint, pipes events to the browser in real-time,
   * and saves results to the database when the `complete` event arrives.
   */
  @Post('stream')
  async streamCheck(
    @Param('id') projectId: string,
    @Body() body: StartComplianceDto,
    @Res() res: Response,
  ) {
    let prepared: Awaited<ReturnType<ComplianceService['prepareCheck']>>;
    try {
      prepared = await this.service.prepareCheck(projectId, body.draftVersion);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status || 500;
      const message = err instanceof Error ? err.message : String(err);
      res.status(status).json({ error: message });
      return;
    }

    const { checkId, requestBody } = prepared;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    try {
      const upstream = await fetch(`${COMPLIANCE_CHECKER_URL}/check/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        await this.service.markCheckError(checkId);
        res.status(upstream.status).json({ error: text });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completeSaved = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          res.write(chunk);

          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          let currentData = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);
            } else if (line === '' && currentEvent && currentData) {
              if (currentEvent === 'complete' && !completeSaved) {
                try {
                  const payload = JSON.parse(currentData);
                  await this.service.saveStreamComplete(checkId, payload);
                  completeSaved = true;
                } catch (parseErr) {
                  console.error('[Compliance SSE] Failed to parse complete event:', parseErr);
                }
              }
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Compliance SSE] Stream error:', message);
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
        if (!completeSaved) {
          await this.service.markCheckError(checkId);
        }
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.service.markCheckError(checkId);
      res.status(502).json({ error: `Compliance checker service unavailable: ${message}` });
    }
  }
}
