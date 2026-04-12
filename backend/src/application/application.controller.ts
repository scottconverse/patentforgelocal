import { Controller, Get, Post, Put, Param, Body, ParseIntPipe, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApplicationService } from './application.service';
import { UpdateSectionDto } from './dto/update-section.dto';
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

@Controller('projects/:id/application')
export class ApplicationController {
  constructor(
    private readonly service: ApplicationService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  startGeneration(@Param('id') projectId: string) {
    return this.service.startGeneration(projectId);
  }

  @Get()
  getLatest(@Param('id') projectId: string) {
    return this.service.getLatest(projectId);
  }

  @Get('export/docx')
  async exportToDocx(@Param('id') projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.service.getDocxBuffer(projectId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('export/markdown')
  async exportToMarkdown(@Param('id') projectId: string, @Res() res: Response) {
    const { text, filename } = await this.service.getMarkdown(projectId);
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(text);
  }

  @Get(':version')
  getByVersion(@Param('id') projectId: string, @Param('version', ParseIntPipe) version: number) {
    return this.service.getByVersion(projectId, version);
  }

  @Put('sections/:name')
  @HttpCode(HttpStatus.OK)
  updateSection(@Param('id') projectId: string, @Param('name') sectionName: string, @Body() dto: UpdateSectionDto) {
    return this.service.updateSection(projectId, sectionName, dto.text);
  }

  /**
   * SSE proxy — creates an application record, forwards the request to the
   * Python application-generator SSE endpoint, pipes events to the browser in
   * real-time, and saves results to the database when the `complete` event arrives.
   */
  @Post('stream')
  async streamGeneration(@Param('id') projectId: string, @Res() res: Response) {
    let prepared: Awaited<ReturnType<ApplicationService['prepareGeneration']>>;
    try {
      prepared = await this.service.prepareGeneration(projectId);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status || 500;
      const message = err instanceof Error ? err.message : String(err);
      res.status(status).json({ error: message });
      return;
    }

    const { appId, requestBody } = prepared;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    try {
      const upstream = await fetch(`${APPLICATION_GENERATOR_URL}/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        await this.service.markAppError(appId);
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
                  await this.service.saveStreamComplete(appId, payload);
                  completeSaved = true;
                } catch (parseErr) {
                  console.error('[Application SSE] Failed to parse complete event:', parseErr);
                }
              }
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Application SSE] Stream error:', message);
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
          await this.service.markAppError(appId);
        }
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.service.markAppError(appId);
      res.status(502).json({ error: `Application generator service unavailable: ${message}` });
    }
  }
}
