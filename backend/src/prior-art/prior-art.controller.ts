import { Controller, Get, Param, Res, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { PriorArtService } from './prior-art.service';
import { PriorArtSseService } from './prior-art-sse.service';
import { PatentDetailService } from '../patent-detail/patent-detail.service';

@Controller('projects/:id/prior-art')
export class PriorArtController {
  constructor(
    private readonly priorArtService: PriorArtService,
    private readonly sse: PriorArtSseService,
    private readonly patentDetailService: PatentDetailService,
  ) {}

  @Get()
  getLatest(@Param('id') projectId: string) {
    return this.priorArtService.getLatest(projectId);
  }

  @Get('status')
  getStatus(@Param('id') projectId: string) {
    return this.priorArtService.getStatus(projectId);
  }

  @Get('export/csv')
  async exportCsv(@Param('id') projectId: string, @Res() res: Response) {
    const search = await this.priorArtService.getLatest(projectId);
    if (!search || !search.results || search.results.length === 0) {
      res.status(404).send('No prior art results to export');
      return;
    }

    // Try to enrich with cached patent details
    const patentNumbers = search.results.map((r: { patentNumber: string }) => r.patentNumber);
    const enriched = await this.patentDetailService.enrichBatch(patentNumbers);

    // Build CSV
    const headers = [
      'Patent Number',
      'Title',
      'Filing Date',
      'Grant Date',
      'Assignee',
      'Inventors',
      'CPC Codes',
      'Relevance Score',
      'Abstract',
      'Source',
    ];
    interface PriorArtRow {
      patentNumber: string;
      title: string;
      relevanceScore: number;
      abstract: string | null;
      source: string | null;
    }
    interface PatentDetailRow {
      filingDate?: string | null;
      grantDate?: string | null;
      assignee?: string | string[] | null;
      inventors?: string | string[] | null;
      cpcClassifications?: ({ code: string } | string)[] | null;
    }
    const rows = search.results.map((r: PriorArtRow) => {
      const detail = enriched.get(r.patentNumber) as PatentDetailRow | undefined;
      return [
        r.patentNumber,
        csvEscape(r.title),
        detail?.filingDate ?? '',
        detail?.grantDate ?? '',
        detail?.assignee ? (Array.isArray(detail.assignee) ? detail.assignee.join('; ') : detail.assignee) : '',
        detail?.inventors ? (Array.isArray(detail.inventors) ? detail.inventors.join('; ') : detail.inventors) : '',
        detail?.cpcClassifications
          ? Array.isArray(detail.cpcClassifications)
            ? detail.cpcClassifications.map((c) => (typeof c === 'string' ? c : c.code)).join('; ')
            : ''
          : '',
        (r.relevanceScore * 100).toFixed(0) + '%',
        csvEscape((r.abstract ?? '').slice(0, 500)),
        r.source ?? 'PatentsView',
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="prior-art-${projectId.slice(0, 8)}.csv"`);
    res.send(csv);
  }

  @Get('stream')
  stream(@Param('id') projectId: string, @Res() res: Response, @Req() req: Request) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emitter = this.sse.getOrCreate(projectId);

    const onEvent = (event: { type: string; [key: string]: unknown }) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    emitter.on('event', onEvent);

    req.on('close', () => {
      emitter.off('event', onEvent);
    });
  }
}

function csvEscape(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
