/**
 * USPTO Open Data Portal (ODP) enrichment client.
 * Fetches patent detail (title, dates, inventors, assignees, CPC codes)
 * for a single patent by patent number.
 *
 * Claims text is NOT available in ODP metadata — the frontend handles
 * this gracefully with a "View on Google Patents" fallback link.
 *
 * @see https://data.uspto.gov/apis/patent-file-wrapper/search
 */

import { EnrichedPatent } from './patentsview-enrichment';

const SEARCH_URL = 'https://api.uspto.gov/api/v1/patent/applications/search';
const TIMEOUT_MS = 30_000;
const RETRY_DELAY_ON_429_MS = 10_000;
const MAX_RETRIES_ON_429 = 1;

interface ODPEnrichmentBag {
  applicationMetaData?: {
    inventionTitle?: string;
    patentNumber?: string;
    grantDate?: string;
    filingDate?: string;
    effectiveFilingDate?: string;
    cpcClassificationBag?: string[];
    inventorBag?: { firstName?: string; lastName?: string; inventorNameText?: string }[];
    applicantBag?: { applicantNameText?: string }[];
    firstApplicantName?: string;
    applicationTypeLabelName?: string;
  };
  assignmentBag?: {
    assigneeBag?: { assigneeNameText?: string }[];
  }[];
}

interface ODPEnrichmentSearchResponse {
  patentFileWrapperDataBag?: ODPEnrichmentBag[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch enriched patent data from the USPTO Open Data Portal.
 * Searches by patent number and extracts metadata fields.
 * Returns null if the patent is not found or the API fails.
 */
export async function fetchEnrichedPatentODP(
  patentNumber: string,
  apiKey: string,
  retryCount = 0,
): Promise<EnrichedPatent | null> {
  // Extract the numeric patent number (strip "US" prefix and letter suffix)
  const cleanNumber = patentNumber.replace(/^US/i, '').replace(/[A-Z]\d*$/i, '');

  const body = {
    q: `applicationMetaData.patentNumber:${cleanNumber}`,
    filters: [{ name: 'applicationMetaData.publicationCategoryBag', value: ['Granted/Issued'] }],
    pagination: { offset: 0, limit: 1 },
    fields: ['applicationNumberText', 'applicationMetaData', 'assignmentBag'],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status === 429) {
      if (retryCount < MAX_RETRIES_ON_429) {
        console.warn(`[ODP-Enrich] Rate limited for ${patentNumber}, waiting ${RETRY_DELAY_ON_429_MS / 1000}s...`);
        await sleep(RETRY_DELAY_ON_429_MS);
        return fetchEnrichedPatentODP(patentNumber, apiKey, retryCount + 1);
      }
      console.warn(`[ODP-Enrich] Rate limited for ${patentNumber} after retry, giving up`);
      return null;
    }

    if (!res.ok) {
      console.warn(`[ODP-Enrich] HTTP ${res.status} for ${patentNumber}`);
      return null;
    }

    const data = (await res.json()) as ODPEnrichmentSearchResponse;
    const bags = data.patentFileWrapperDataBag;
    if (!bags || bags.length === 0) {
      console.warn(`[ODP-Enrich] No results for patent ${patentNumber}`);
      return null;
    }

    return parseODPResult(patentNumber, bags[0]);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[ODP-Enrich] Timeout for ${patentNumber}`);
    } else {
      console.warn(`[ODP-Enrich] Error for ${patentNumber}:`, err instanceof Error ? err.message : String(err));
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseODPResult(patentNumber: string, bag: ODPEnrichmentBag): EnrichedPatent {
  const meta = bag.applicationMetaData ?? {};

  // Inventors from inventorBag
  const inventors: string[] = [];
  if (Array.isArray(meta.inventorBag)) {
    for (const inv of meta.inventorBag) {
      const name = inv.inventorNameText ?? `${inv.firstName ?? ''} ${inv.lastName ?? ''}`.trim();
      if (name) inventors.push(name);
    }
  }

  // Assignees: try assignmentBag first (most accurate), fall back to applicantBag
  const assignees: string[] = [];
  if (Array.isArray(bag.assignmentBag)) {
    const seenAssignees = new Set<string>();
    for (const assignment of bag.assignmentBag) {
      if (Array.isArray(assignment.assigneeBag)) {
        for (const assignee of assignment.assigneeBag) {
          const name = assignee.assigneeNameText;
          if (name && !seenAssignees.has(name.toUpperCase())) {
            seenAssignees.add(name.toUpperCase());
            assignees.push(name);
          }
        }
      }
    }
  }
  if (assignees.length === 0 && meta.firstApplicantName) {
    assignees.push(meta.firstApplicantName);
  }

  // CPC classifications — ODP returns flat array of code strings
  const cpcClassifications: { code: string; title: string }[] = [];
  if (Array.isArray(meta.cpcClassificationBag)) {
    const seenCpc = new Set<string>();
    for (const code of meta.cpcClassificationBag) {
      if (typeof code === 'string' && !seenCpc.has(code)) {
        seenCpc.add(code);
        cpcClassifications.push({ code, title: '' });
      }
    }
  }

  return {
    patentNumber,
    title: meta.inventionTitle ?? null,
    abstract: null, // ODP metadata doesn't include abstracts
    filingDate: meta.filingDate ?? meta.effectiveFilingDate ?? null,
    grantDate: meta.grantDate ?? null,
    assignees,
    inventors,
    cpcClassifications,
    claims: [], // Claims not available in ODP metadata
    claimCount: 0,
    patentType: meta.applicationTypeLabelName?.toLowerCase() ?? null,
  };
}
