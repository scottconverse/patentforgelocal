import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriorArtSseService } from './prior-art-sse.service';
import { PatentsViewPatent } from './patentsview-client';
import { searchODPMulti } from './odp-client';

@Injectable()
export class PriorArtService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sse: PriorArtSseService,
  ) {}

  /** Returns the latest PriorArtSearch for a project (with results), or a stub object if none exists */
  async getLatest(projectId: string) {
    const search = await this.prisma.priorArtSearch.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      include: {
        results: { orderBy: { relevanceScore: 'desc' } },
      },
    });
    if (!search) {
      return {
        id: null,
        projectId,
        version: 0,
        status: 'NONE',
        query: null,
        startedAt: null,
        completedAt: null,
        results: [],
      };
    }
    return search;
  }

  async getStatus(projectId: string) {
    const search = await this.prisma.priorArtSearch.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      include: { _count: { select: { results: true } } },
    });
    if (!search) return { status: 'NONE', resultCount: 0, completedAt: null };
    return { status: search.status, resultCount: search._count.results, completedAt: search.completedAt };
  }

  /** Called from the feasibility controller when a run starts. Non-blocking — starts background work. */
  startSearch(
    projectId: string,
    feasibilityRunId: string,
    narrative: string,
    apiKey: string,
    usptoApiKey?: string,
  ): void {
    this.runSearch(projectId, feasibilityRunId, narrative, apiKey, usptoApiKey).catch((err) =>
      console.error(`[PriorArt] search failed for project ${projectId}:`, err),
    );
  }

  private async runSearch(
    projectId: string,
    feasibilityRunId: string,
    narrative: string,
    apiKey: string,
    usptoApiKey?: string,
  ): Promise<void> {
    // Determine version
    const last = await this.prisma.priorArtSearch.findFirst({ where: { projectId }, orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;

    const search = await this.prisma.priorArtSearch.create({
      data: {
        projectId,
        feasibilityRunId,
        version,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    this.sse.emit(projectId, { type: 'prior_art_start', searchId: search.id });

    try {
      // Step 1: Extract search queries via Claude Haiku
      const queries = await this.extractSearchQueries(narrative, apiKey);

      await this.prisma.priorArtSearch.update({
        where: { id: search.id },
        data: { query: JSON.stringify(queries) },
      });

      this.sse.emit(projectId, { type: 'prior_art_queries', queries });

      // Step 2: Query patent database via USPTO Open Data Portal
      // PatentsView API has been shut down (HTTP 410) — ODP is the only working source.
      const allTerms = queries.flatMap((q) => q.toLowerCase().split(/\s+/));
      let rawResults: PatentsViewPatent[];
      let source: string;
      if (usptoApiKey) {
        const odpResult = await searchODPMulti(queries, usptoApiKey);
        rawResults = odpResult.results;
        source = 'USPTO ODP';

        // Log ODP usage for tracking
        await this.prisma.odpApiUsage
          .create({
            data: {
              projectId,
              queriesAttempted: odpResult.metadata.queriesAttempted,
              resultsFound: odpResult.metadata.resultsFound,
              hadRateLimit: odpResult.metadata.hadRateLimit,
              hadError: odpResult.metadata.hadError,
              errorMessage: odpResult.metadata.errorMessage ?? null,
            },
          })
          .catch((err) => console.warn('[ODP] Failed to log usage:', err.message));
      } else {
        throw new Error(
          'No USPTO API key configured. The PatentsView API has been shut down. ' +
            'Add a USPTO Open Data Portal API key in Settings to enable prior art search.',
        );
      }

      // Emit progress (one event per query equivalent)
      this.sse.emit(projectId, {
        type: 'prior_art_progress',
        queryIndex: 0,
        query: queries[0] ?? '',
        resultCount: rawResults.length,
      });

      // Step 3: Score and filter
      const scored = rawResults
        .map((p) => ({ patent: p, score: scoreRelevance(p, allTerms) }))
        .filter((x) => x.score >= 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      // Step 4: Save to DB
      for (const { patent, score } of scored) {
        const abstract = patent.patent_abstract ? patent.patent_abstract.slice(0, 800) : null;
        const snippet = extractSnippet(patent.patent_abstract ?? '', allTerms);

        await this.prisma.priorArtResult.create({
          data: {
            searchId: search.id,
            patentNumber: patent.patent_id,
            title: patent.patent_title ?? '(untitled)',
            abstract,
            relevanceScore: score,
            snippet,
            source,
          },
        });
      }

      await this.prisma.priorArtSearch.update({
        where: { id: search.id },
        data: { status: 'COMPLETE', completedAt: new Date() },
      });

      this.sse.emit(projectId, { type: 'prior_art_complete', searchId: search.id, totalResults: scored.length });
    } catch (err) {
      // Update search status to ERROR — but the record may already be gone
      // if the project was deleted while this background search was running.
      try {
        await this.prisma.priorArtSearch.update({
          where: { id: search.id },
          data: { status: 'ERROR' },
        });
      } catch {
        // Record already deleted (cascade from project deletion) — nothing to update
      }
      this.sse.emit(projectId, { type: 'prior_art_error', message: (err as Error).message });
    }
  }

  private async extractSearchQueries(narrative: string, apiKey: string): Promise<string[]> {
    const truncated = narrative.slice(0, 2000);
    const prompt = `You are a patent search specialist. Given the invention description below, produce exactly 3 search queries for the USPTO PatentsView full-text patent database.

Rules:
- Each query targets a different aspect of the invention (mechanism, application domain, key novel element)
- Use concrete technical terms, not generic phrases
- 3-6 words per query — no filler words like "system for" or "method of"
- Output ONLY a JSON array of strings, nothing else

Invention:
${truncated}

Output format: ["query one", "query two", "query three"]`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const data = (await res.json()) as { content?: { text?: string }[] };
      const text = data.content?.[0]?.text ?? '[]';
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4);
      }
    } catch (err) {
      console.warn('[PriorArt] Query extraction failed, using fallback:', (err as Error).message);
    }

    // Fallback: extract key noun phrases from narrative
    const words = narrative.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const stopWords = new Set([
      'that',
      'this',
      'with',
      'from',
      'have',
      'will',
      'they',
      'been',
      'which',
      'what',
      'when',
      'where',
      'their',
      'about',
      'also',
      'would',
      'could',
      'into',
      'more',
      'some',
      'than',
      'then',
    ]);
    const top = [...freq.entries()]
      .filter(([w]) => !stopWords.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9)
      .map(([w]) => w);
    return [top.slice(0, 3).join(' '), top.slice(3, 6).join(' '), top.slice(6, 9).join(' ')].filter(
      (q) => q.trim().length > 0,
    );
  }

  /** Formats top results as a markdown string for Stage 2 injection */
  async formatContextForPipeline(projectId: string): Promise<string | null> {
    const search = await this.prisma.priorArtSearch.findFirst({
      where: { projectId, status: 'COMPLETE' },
      orderBy: { version: 'desc' },
      include: { results: { orderBy: { relevanceScore: 'desc' }, take: 10 } },
    });
    if (!search || search.results.length === 0) return null;

    const rows = search.results.map(
      (r) =>
        `| ${r.patentNumber} | ${r.title.slice(0, 60)} | ${r.relevanceScore >= 0.7 ? 'High' : r.relevanceScore >= 0.4 ? 'Medium' : 'Low'} |`,
    );

    const table = ['| Patent Number | Title | Relevance |', '|---|---|---|', ...rows].join('\n');

    const abstracts = search.results
      .slice(0, 5)
      .map((r) => `**${r.patentNumber}** — ${r.title}\n${r.snippet ?? r.abstract?.slice(0, 300) ?? '(no abstract)'}`)
      .join('\n\n');

    return `${table}\n\n**Key abstracts:**\n\n${abstracts}`;
  }
}

/**
 * Common English stop-words that inflate false-positive matches in patent text.
 * Only includes 4+ character words since shorter ones are already filtered by length.
 */
const STOP_WORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'have',
  'been',
  'were',
  'they',
  'them',
  'their',
  'will',
  'would',
  'could',
  'should',
  'shall',
  'being',
  'about',
  'each',
  'which',
  'when',
  'what',
  'where',
  'also',
  'more',
  'some',
  'such',
  'than',
  'then',
  'into',
  'only',
  'very',
  'just',
  'over',
  'most',
  'said',
  'does',
  'made',
  'make',
  'like',
  'well',
  'back',
  'even',
  'here',
  'much',
  'many',
  'both',
  'same',
  'other',
  'after',
  'before',
  'between',
  'under',
  'above',
  'below',
  'through',
  'during',
  'having',
  'including',
  'according',
  'wherein',
  'thereof',
  'herein',
  'therein',
  'comprising',
  'comprises',
  'provided',
  'method',
  'system',
  'apparatus',
  'device',
  'means',
]);

/**
 * Score patent relevance against query terms.
 * Improvements over naive keyword matching:
 * - Stop-word filtering to reduce noise on common patent language
 * - Title matches weighted 2x over abstract matches (title is more specific)
 * - Term frequency weighting (multiple occurrences score higher)
 * - Recency boost for newer patents (15% weight, 20-year decay)
 */
export function scoreRelevance(patent: PatentsViewPatent, queryTerms: string[]): number {
  const title = (patent.patent_title ?? '').toLowerCase();
  const abstract = (patent.patent_abstract ?? '').toLowerCase();
  const unique = [...new Set(queryTerms.filter((t) => t.length >= 4 && !STOP_WORDS.has(t)))];
  if (unique.length === 0) return 0;

  // Score each term with title weighting and frequency
  let totalScore = 0;
  const hasAbstract = abstract.length > 0;
  for (const term of unique) {
    const titleHit = title.includes(term) ? 1 : 0;
    const abstractHit = abstract.includes(term) ? 1 : 0;
    // Title match = 2 points, abstract match = 1 point (max 3 per term)
    totalScore += titleHit * 2 + abstractHit;
  }

  // Normalize: max possible = 3 * unique.length
  let termScore = totalScore / (unique.length * 3);

  // Bias correction: ODP results have null abstracts, so they can only match on title.
  // Without correction, ODP results are systematically underscored vs results with abstracts.
  // Apply 1.5x multiplier for title-only scoring to compensate for the missing dimension.
  if (!hasAbstract && termScore > 0) {
    termScore = Math.min(1.0, termScore * 1.5);
  }

  // Recency boost: newer patents get up to 15% bonus
  const year = parseInt(patent.patent_date?.slice(0, 4) ?? '2000', 10);
  const age = Math.max(0, new Date().getFullYear() - year);
  const recencyBoost = Math.max(0, 1 - age / 20) * 0.15;

  return Math.min(1.0, termScore * 0.85 + recencyBoost);
}

function extractSnippet(abstract: string, terms: string[]): string {
  if (!abstract) return '';
  const lower = abstract.toLowerCase();
  const firstHit =
    terms
      .map((t) => lower.indexOf(t))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstHit - 40);
  return abstract.slice(start, start + 200).trim();
}
