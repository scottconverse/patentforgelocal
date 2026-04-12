/**
 * USPTO Open Data Portal (ODP) continuity client.
 * Fetches patent family relationships (parent/child/continuation)
 * for a given patent number using the ODP continuity data.
 *
 * The ODP applicationMetaData includes a `continuityBag` field that
 * contains parent and child application references.
 */

const SEARCH_URL = 'https://api.uspto.gov/api/v1/patent/applications/search';
const TIMEOUT_MS = 30_000;
const RETRY_DELAY_ON_429_MS = 10_000;
const MAX_RETRIES_ON_429 = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shape of an ODP continuity bag entry from the API */
interface ODPContinuityBagEntry {
  patentNumber?: string;
  applicationNumberText?: string;
  parentApplicationNumberText?: string;
  childApplicationNumberText?: string;
  continuityType?: string;
  claimType?: string;
  filingDate?: string;
  grantDate?: string;
  inventionTitle?: string;
  applicationStatusDescriptionText?: string;
  parentApplicationBag?: ODPContinuityBagEntry[];
  childApplicationBag?: ODPContinuityBagEntry[];
}

/** Shape of the top-level ODP search result bag */
interface ODPContinuityResultBag {
  continuityBag?: ODPContinuityBagEntry[];
  parentApplicationBag?: ODPContinuityBagEntry[];
  childApplicationBag?: ODPContinuityBagEntry[];
  applicationMetaData?: {
    continuityBag?: ODPContinuityBagEntry[];
    parentApplicationBag?: ODPContinuityBagEntry[];
    childApplicationBag?: ODPContinuityBagEntry[];
  };
}

interface ODPContinuitySearchResponse {
  patentFileWrapperDataBag?: ODPContinuityResultBag[];
}

export interface PatentFamilyMember {
  patentNumber: string | null;
  applicationNumber: string | null;
  relationship: string; // 'parent', 'child', 'continuation', 'continuation-in-part', 'divisional'
  filingDate: string | null;
  grantDate: string | null;
  title: string | null;
  status: string | null; // 'granted', 'pending', 'abandoned'
}

/**
 * Fetch patent family (continuity) data from the USPTO ODP.
 * Returns an array of related patents/applications.
 * Returns null if the patent is not found or the API fails.
 */
export async function fetchPatentFamilyODP(
  patentNumber: string,
  apiKey: string,
  retryCount = 0,
): Promise<PatentFamilyMember[] | null> {
  const cleanNumber = patentNumber.replace(/^US/i, '').replace(/[A-Z]\d*$/i, '');

  const body = {
    q: `applicationMetaData.patentNumber:${cleanNumber}`,
    filters: [{ name: 'applicationMetaData.publicationCategoryBag', value: ['Granted/Issued'] }],
    pagination: { offset: 0, limit: 1 },
    fields: ['applicationNumberText', 'applicationMetaData', 'continuityBag'],
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
        console.warn(`[ODP-Continuity] Rate limited for ${patentNumber}, waiting ${RETRY_DELAY_ON_429_MS / 1000}s...`);
        await sleep(RETRY_DELAY_ON_429_MS);
        return fetchPatentFamilyODP(patentNumber, apiKey, retryCount + 1);
      }
      console.warn(`[ODP-Continuity] Rate limited for ${patentNumber} after retry, giving up`);
      return null;
    }

    if (!res.ok) {
      console.warn(`[ODP-Continuity] HTTP ${res.status} for ${patentNumber}`);
      return null;
    }

    const data = (await res.json()) as ODPContinuitySearchResponse;
    const bags = data.patentFileWrapperDataBag;
    if (!bags || bags.length === 0) {
      console.warn(`[ODP-Continuity] No results for patent ${patentNumber}`);
      return null;
    }

    return parseContinuityData(bags[0]);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[ODP-Continuity] Timeout for ${patentNumber}`);
    } else {
      console.warn(`[ODP-Continuity] Error for ${patentNumber}:`, err instanceof Error ? err.message : String(err));
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseContinuityData(bag: ODPContinuityResultBag): PatentFamilyMember[] {
  const members: PatentFamilyMember[] = [];
  const seen = new Set<string>();

  // Parse continuityBag — contains parent and child application references
  const continuityBag = bag.continuityBag ?? bag.applicationMetaData?.continuityBag;
  if (Array.isArray(continuityBag)) {
    for (const entry of continuityBag) {
      parseContinuityEntry(entry, members, seen);
    }
  }

  // Also check parentApplicationBag if present
  const parentBag = bag.parentApplicationBag ?? bag.applicationMetaData?.parentApplicationBag;
  if (Array.isArray(parentBag)) {
    for (const parent of parentBag) {
      addMember(members, seen, {
        patentNumber: parent.patentNumber ?? null,
        applicationNumber: parent.applicationNumberText ?? parent.parentApplicationNumberText ?? null,
        relationship: mapRelationship(parent.continuityType ?? parent.claimType ?? 'parent'),
        filingDate: parent.filingDate ?? null,
        grantDate: parent.grantDate ?? null,
        title: parent.inventionTitle ?? null,
        status: parent.patentNumber ? 'granted' : (parent.applicationStatusDescriptionText ?? null),
      });
    }
  }

  // Also check childApplicationBag if present
  const childBag = bag.childApplicationBag ?? bag.applicationMetaData?.childApplicationBag;
  if (Array.isArray(childBag)) {
    for (const child of childBag) {
      addMember(members, seen, {
        patentNumber: child.patentNumber ?? null,
        applicationNumber: child.applicationNumberText ?? child.childApplicationNumberText ?? null,
        relationship: mapRelationship(child.continuityType ?? child.claimType ?? 'child'),
        filingDate: child.filingDate ?? null,
        grantDate: child.grantDate ?? null,
        title: child.inventionTitle ?? null,
        status: child.patentNumber ? 'granted' : (child.applicationStatusDescriptionText ?? null),
      });
    }
  }

  return members;
}

function parseContinuityEntry(entry: ODPContinuityBagEntry, members: PatentFamilyMember[], seen: Set<string>): void {
  // Each continuity entry may have parentApplicationBag or childApplicationBag
  if (Array.isArray(entry.parentApplicationBag)) {
    for (const parent of entry.parentApplicationBag) {
      addMember(members, seen, {
        patentNumber: parent.patentNumber ?? null,
        applicationNumber: parent.applicationNumberText ?? null,
        relationship: mapRelationship(entry.claimType ?? entry.continuityType ?? 'parent'),
        filingDate: parent.filingDate ?? null,
        grantDate: parent.grantDate ?? null,
        title: parent.inventionTitle ?? null,
        status: parent.patentNumber ? 'granted' : (parent.applicationStatusDescriptionText ?? null),
      });
    }
  }
  if (Array.isArray(entry.childApplicationBag)) {
    for (const child of entry.childApplicationBag) {
      addMember(members, seen, {
        patentNumber: child.patentNumber ?? null,
        applicationNumber: child.applicationNumberText ?? null,
        relationship: mapRelationship(entry.claimType ?? entry.continuityType ?? 'child'),
        filingDate: child.filingDate ?? null,
        grantDate: child.grantDate ?? null,
        title: child.inventionTitle ?? null,
        status: child.patentNumber ? 'granted' : (child.applicationStatusDescriptionText ?? null),
      });
    }
  }

  // Direct entry with application data
  if (entry.applicationNumberText || entry.patentNumber) {
    addMember(members, seen, {
      patentNumber: entry.patentNumber ?? null,
      applicationNumber: entry.applicationNumberText ?? null,
      relationship: mapRelationship(entry.claimType ?? entry.continuityType ?? 'related'),
      filingDate: entry.filingDate ?? null,
      grantDate: entry.grantDate ?? null,
      title: entry.inventionTitle ?? null,
      status: entry.patentNumber ? 'granted' : (entry.applicationStatusDescriptionText ?? null),
    });
  }
}

function addMember(members: PatentFamilyMember[], seen: Set<string>, member: PatentFamilyMember): void {
  const key = member.patentNumber ?? member.applicationNumber ?? '';
  if (!key || seen.has(key)) return;
  seen.add(key);
  members.push(member);
}

function mapRelationship(raw: string): string {
  const lower = (raw ?? '').toLowerCase().trim();
  if (lower.includes('continuation-in-part') || lower === 'cip') return 'continuation-in-part';
  if (lower.includes('continuation') || lower === 'con') return 'continuation';
  if (lower.includes('divisional') || lower === 'div') return 'divisional';
  if (lower.includes('reissue')) return 'reissue';
  if (lower.includes('parent')) return 'parent';
  if (lower.includes('child')) return 'child';
  return lower || 'related';
}
