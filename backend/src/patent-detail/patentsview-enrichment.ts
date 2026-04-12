/**
 * PatentsView enrichment client — fetches expanded patent data by patent number.
 * Uses the same PatentsView API as prior-art search but requests additional fields
 * (claims, assignees, inventors, CPC codes, filing date).
 */

export interface EnrichedPatent {
  patentNumber: string;
  title: string | null;
  abstract: string | null;
  filingDate: string | null;
  grantDate: string | null;
  assignees: string[];
  inventors: string[];
  cpcClassifications: { code: string; title: string }[];
  claims: { number: number; text: string }[];
  claimCount: number;
  patentType: string | null;
}

interface PatentsViewEnrichPatent {
  patent_id?: string;
  patent_title?: string;
  patent_abstract?: string;
  patent_date?: string;
  patent_type?: string;
  patent_num_claims?: number;
  application?: { filing_date?: string }[] | { filing_date?: string };
  assignees?: { assignee_organization?: string; assignee_individual_name_first?: string; assignee_individual_name_last?: string }[];
  inventors?: { inventor_name_first?: string; inventor_name_last?: string }[];
  cpc_current?: { cpc_group_id?: string; cpc_group_title?: string }[];
  claims?: { claim_number?: number; claim_text?: string }[];
}

interface PatentsViewEnrichResponse {
  patents: PatentsViewEnrichPatent[] | null;
  error?: boolean;
  message?: string;
}

const BASE_URL = 'https://search.patentsview.org/api/v1/patent/';
const TIMEOUT_MS = 15_000;

const ENRICHMENT_FIELDS = [
  'patent_id',
  'patent_title',
  'patent_abstract',
  'patent_date',
  'patent_type',
  'patent_num_claims',
  'application.filing_date',
  'assignees.assignee_organization',
  'assignees.assignee_individual_name_first',
  'assignees.assignee_individual_name_last',
  'inventors.inventor_name_first',
  'inventors.inventor_name_last',
  'cpc_current.cpc_group_id',
  'cpc_current.cpc_group_title',
  'claims.claim_text',
  'claims.claim_number',
];

/**
 * Fetch enriched patent data from PatentsView for a single patent number.
 * Returns null if the patent is not found.
 */
export async function fetchEnrichedPatent(patentNumber: string): Promise<EnrichedPatent | null> {
  // Normalize patent number: strip "US" prefix and any letter suffix for the API query
  const cleanId = patentNumber.replace(/^US/i, '').replace(/[A-Z]\d*$/i, '');

  const body = {
    q: { patent_id: cleanId },
    f: ENRICHMENT_FIELDS,
    o: { size: 1 },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[PatentDetail] PatentsView returned HTTP ${res.status} for ${patentNumber}`);
      return null;
    }

    const data = (await res.json()) as PatentsViewEnrichResponse;

    // Detect PatentsView migration/shutdown response
    if (data.error === true && typeof data.message === 'string' && data.message.includes('migrating')) {
      console.warn('[PatentDetail] PatentsView API has been shut down (migrated to USPTO ODP)');
      return null;
    }

    if (!data.patents || data.patents.length === 0) return null;

    const p = data.patents[0];
    return parseEnrichedPatent(patentNumber, p);
  } catch (err) {
    console.warn(`[PatentDetail] Failed to fetch ${patentNumber}:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseEnrichedPatent(patentNumber: string, p: PatentsViewEnrichPatent): EnrichedPatent {
  // Assignees
  const assignees: string[] = [];
  if (Array.isArray(p.assignees)) {
    for (const a of p.assignees) {
      if (a.assignee_organization) {
        assignees.push(a.assignee_organization);
      } else if (a.assignee_individual_name_first || a.assignee_individual_name_last) {
        assignees.push(`${a.assignee_individual_name_first ?? ''} ${a.assignee_individual_name_last ?? ''}`.trim());
      }
    }
  }

  // Inventors
  const inventors: string[] = [];
  if (Array.isArray(p.inventors)) {
    for (const inv of p.inventors) {
      const name = `${inv.inventor_name_first ?? ''} ${inv.inventor_name_last ?? ''}`.trim();
      if (name) inventors.push(name);
    }
  }

  // CPC classifications
  const cpcClassifications: { code: string; title: string }[] = [];
  const seenCpc = new Set<string>();
  if (Array.isArray(p.cpc_current)) {
    for (const cpc of p.cpc_current) {
      if (cpc.cpc_group_id && !seenCpc.has(cpc.cpc_group_id)) {
        seenCpc.add(cpc.cpc_group_id);
        cpcClassifications.push({
          code: cpc.cpc_group_id,
          title: cpc.cpc_group_title ?? '',
        });
      }
    }
  }

  // Claims
  const claims: { number: number; text: string }[] = [];
  if (Array.isArray(p.claims)) {
    for (const c of p.claims) {
      if (c.claim_text) {
        claims.push({ number: c.claim_number ?? 0, text: c.claim_text });
      }
    }
    claims.sort((a, b) => a.number - b.number);
  }

  // Filing date from application
  let filingDate: string | null = null;
  if (Array.isArray(p.application) && p.application.length > 0) {
    filingDate = p.application[0].filing_date ?? null;
  } else if (p.application && !Array.isArray(p.application)) {
    filingDate = p.application.filing_date ?? null;
  }

  return {
    patentNumber,
    title: p.patent_title ?? null,
    abstract: p.patent_abstract ?? null,
    filingDate,
    grantDate: p.patent_date ?? null,
    assignees,
    inventors,
    cpcClassifications,
    claims,
    claimCount: p.patent_num_claims ?? claims.length,
    patentType: p.patent_type ?? null,
  };
}
