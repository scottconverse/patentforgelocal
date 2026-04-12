import { Controller, Get, Post, Put, Param, Body, Query, ParseIntPipe, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { ClaimDraftService } from './claim-draft.service';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { SettingsService } from '../settings/settings.service';

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

@Controller('projects/:id/claims')
export class ClaimDraftController {
  constructor(
    private readonly service: ClaimDraftService,
    private readonly settingsService: SettingsService,
  ) {}

  /** POST /api/projects/:id/claims/draft — Start claim generation */
  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  startDraft(@Param('id') projectId: string) {
    return this.service.startDraft(projectId);
  }

  /**
   * GET /api/projects/:id/claims — Get latest claim draft.
   * By default returns preview (first 200 chars) instead of full text.
   * Pass ?full=true to get full text (backwards compatible).
   */
  @Get()
  getLatest(@Param('id') projectId: string, @Query('full') full?: string) {
    return this.service.getLatest(projectId, full === 'true');
  }

  /** GET /api/projects/:id/claims/export/docx — Export claims as Word document */
  @Get('export/docx')
  async exportToDocx(@Param('id') projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.service.getDocxBuffer(projectId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** GET /api/projects/:id/claims/text/:claimId — Get full text of a single claim */
  @Get('text/:claimId')
  getClaimText(@Param('id') projectId: string, @Param('claimId') claimId: string) {
    return this.service.getClaimText(projectId, claimId);
  }

  /** GET /api/projects/:id/claims/:version — Get specific version */
  @Get(':version')
  getByVersion(@Param('id') projectId: string, @Param('version', ParseIntPipe) version: number) {
    return this.service.getByVersion(projectId, version);
  }

  /** PUT /api/projects/:id/claims/edit/:claimId — Update claim text */
  @Put('edit/:claimId')
  @HttpCode(HttpStatus.OK)
  updateClaim(@Param('id') projectId: string, @Param('claimId') claimId: string, @Body() dto: UpdateClaimDto) {
    return this.service.updateClaim(projectId, claimId, dto.text);
  }

  /** POST /api/projects/:id/claims/:claimNumber/regenerate — Regenerate a single claim */
  @Post(':claimNumber/regenerate')
  @HttpCode(HttpStatus.OK)
  regenerateClaim(@Param('id') projectId: string, @Param('claimNumber', ParseIntPipe) claimNumber: number) {
    return this.service.regenerateClaim(projectId, claimNumber);
  }

  /**
   * SSE proxy — creates a claim draft record, forwards the request to the
   * Python claim-drafter SSE endpoint, pipes events to the browser in real-time,
   * and saves results to the database when the `complete` event arrives.
   */
  @Post('stream')
  async streamDraft(@Param('id') projectId: string, @Res() res: Response) {
    // Build request body and create the draft record (validates project, concurrency, cost cap)
    let prepared: Awaited<ReturnType<ClaimDraftService['prepareDraft']>>;
    try {
      prepared = await this.service.prepareDraft(projectId);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status || 500;
      const message = err instanceof Error ? err.message : String(err);
      res.status(status).json({ error: message });
      return;
    }

    const { draftId, requestBody } = prepared;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    try {
      const upstream = await fetch(`${CLAIM_DRAFTER_URL}/draft`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        await this.service.markDraftError(draftId);
        res.status(upstream.status).json({ error: text });
        return;
      }

      // Set SSE headers and pipe upstream response through
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

          // Forward to client immediately
          res.write(chunk);

          // Buffer for parsing SSE events
          buffer += chunk;

          // Try to extract complete events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete last line

          let currentEvent = '';
          let currentData = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);
            } else if (line === '' && currentEvent && currentData) {
              // End of SSE event
              if (currentEvent === 'complete' && !completeSaved) {
                try {
                  const payload = JSON.parse(currentData);
                  await this.service.saveStreamComplete(draftId, payload);
                  completeSaved = true;
                } catch (parseErr) {
                  console.error('[ClaimDraft SSE] Failed to parse complete event:', parseErr);
                }
              }
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[ClaimDraft SSE] Stream error:', message);
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
          await this.service.markDraftError(draftId);
        }
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.service.markDraftError(draftId);
      res.status(502).json({ error: `Claim drafter service unavailable: ${message}` });
    }
  }
}
