export interface PatentsViewPatent {
  patent_id: string;
  patent_title: string;
  patent_abstract: string | null;
  patent_date: string | null;
  patent_type: string | null;
}

interface PatentsViewResponse {
  patents: PatentsViewPatent[] | null;
  total_patent_count?: number;
}

const BASE_URL = 'https://search.patentsview.org/api/v1/patent/';
const FIELDS = ['patent_id', 'patent_title', 'patent_abstract', 'patent_date', 'patent_type'];
const TIMEOUT_MS = 10_000;
const DELAY_BETWEEN_QUERIES_MS = 500;

let _apiKey: string = '';

/** Set the PatentSearch API key for authenticated requests. */
export function setPatentSearchApiKey(key: string): void {
  _apiKey = key;
}

/** Error thrown when PatentsView API has been shut down / migrated */
export class PatentsViewMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatentsViewMigrationError';
  }
}

async function queryPatentsView(queryStr: string, size = 15): Promise<PatentsViewPatent[]> {
  const body = {
    q: { _text_any: { patent_abstract: queryStr } },
    f: FIELDS,
    o: { per_page: size },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_apiKey) {
      headers['X-Api-Key'] = _apiKey;
    }

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let snippet = '';
      try { snippet = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`PatentsView HTTP ${res.status}${snippet ? ': ' + snippet : ''}`);
    }
    const data = (await res.json()) as PatentsViewResponse & { error?: boolean; message?: string };
    // Detect PatentsView migration/shutdown response
    if (data.error === true && typeof data.message === 'string' && data.message.includes('migrating')) {
      throw new PatentsViewMigrationError(
        'The PatentsView API has been shut down and migrated to the USPTO Open Data Portal (data.uspto.gov). ' +
          'Prior art search is temporarily unavailable. This will be restored in a future update.',
      );
    }
    return data.patents ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchPatentsViewMulti(queries: string[]): Promise<PatentsViewPatent[]> {
  const seen = new Set<string>();
  const combined: PatentsViewPatent[] = [];

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(DELAY_BETWEEN_QUERIES_MS);
    try {
      const results = await queryPatentsView(queries[i], 15);
      for (const p of results) {
        if (!seen.has(p.patent_id)) {
          seen.add(p.patent_id);
          combined.push(p);
        }
      }
    } catch (err) {
      // Propagate migration errors — these are not transient and should stop the search
      if (err instanceof PatentsViewMigrationError) throw err;
      console.warn(`PatentsView query failed for "${queries[i]}":`, (err as Error).message);
    }
  }

  return combined;
}
