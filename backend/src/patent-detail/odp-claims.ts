/**
 * USPTO Open Data Portal (ODP) — Claims Fetcher
 *
 * Fetches patent claims from the ODP Documents API by:
 * 1. Looking up application number from patent number (via ODP search)
 * 2. Fetching the document list for that application
 * 3. Finding the most recent CLM (Claims) document with XML download
 * 4. Downloading the XML archive (tar), extracting the .XML file
 * 5. Parsing claim elements from the ST96 XML
 *
 * @see https://data.uspto.gov/apis/patent-file-wrapper/documents
 */

const SEARCH_URL = 'https://api.uspto.gov/api/v1/patent/applications/search';
const DOCUMENTS_URL_BASE = 'https://api.uspto.gov/api/v1/patent/applications';
const TIMEOUT_MS = 30_000;
const RETRY_DELAY_ON_429_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ParsedClaim {
  number: number;
  text: string;
}

export interface ClaimsFetchResult {
  claims: ParsedClaim[];
  claimCount: number;
  claimsText: string;
}

/**
 * Fetch claims for a patent from the ODP Documents API.
 * Returns null if claims cannot be retrieved (no docs, no XML, parse error).
 */
export async function fetchClaimsFromODP(patentNumber: string, apiKey: string): Promise<ClaimsFetchResult | null> {
  // Step 1: Look up application number from patent number
  const appNumber = await lookupApplicationNumber(patentNumber, apiKey);
  if (!appNumber) {
    console.warn(`[ODP-Claims] Could not find application number for ${patentNumber}`);
    return null;
  }

  // Step 2: Fetch documents list
  const documents = await fetchDocumentsList(appNumber, apiKey);
  if (!documents || documents.length === 0) {
    console.warn(`[ODP-Claims] No documents found for application ${appNumber}`);
    return null;
  }

  // Step 3: Find most recent CLM document with XML download
  const clmDoc = findMostRecentClmDocument(documents);
  if (!clmDoc) {
    console.warn(`[ODP-Claims] No CLM document with XML found for application ${appNumber}`);
    return null;
  }

  // Step 4: Download and extract XML from tar archive
  const xmlContent = await downloadAndExtractXml(clmDoc.xmlUrl, apiKey);
  if (!xmlContent) {
    console.warn(`[ODP-Claims] Could not download/extract CLM XML for application ${appNumber}`);
    return null;
  }

  // Step 5: Parse claims from ST96 XML
  const claims = parseClaimsFromXml(xmlContent);
  if (claims.length === 0) {
    console.warn(`[ODP-Claims] No active claims found in XML for ${patentNumber}`);
    return null;
  }

  const claimsText = claims.map((c) => `${c.number}. ${c.text}`).join('\n\n');
  return { claims, claimCount: claims.length, claimsText };
}

/**
 * Look up the application number for a patent number via ODP search.
 */
async function lookupApplicationNumber(patentNumber: string, apiKey: string): Promise<string | null> {
  const cleanNumber = patentNumber.replace(/^US/i, '').replace(/[A-Z]\d*$/i, '');

  const body = {
    q: `applicationMetaData.patentNumber:${cleanNumber}`,
    filters: [{ name: 'applicationMetaData.publicationCategoryBag', value: ['Granted/Issued'] }],
    pagination: { offset: 0, limit: 1 },
    fields: ['applicationNumberText'],
  };

  const result = await odpFetch(
    SEARCH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
    },
    apiKey,
  );

  if (!result) return null;

  const data = (await result.json()) as { patentFileWrapperDataBag?: { applicationNumberText?: string }[] };
  const bags = data?.patentFileWrapperDataBag;
  if (!Array.isArray(bags) || bags.length === 0) return null;

  return bags[0].applicationNumberText ?? null;
}

interface DocumentInfo {
  documentCode: string;
  officialDate: string;
  xmlUrl: string;
}

/**
 * Fetch the documents list for an application number.
 */
async function fetchDocumentsList(applicationNumber: string, apiKey: string): Promise<DocumentInfo[] | null> {
  const url = `${DOCUMENTS_URL_BASE}/${applicationNumber}/documents`;

  const result = await odpFetch(
    url,
    {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    },
    apiKey,
  );

  if (!result) return null;

  const data = (await result.json()) as { documentBag?: { documentCode?: string; officialDate?: string; downloadOptionBag?: { mimeTypeIdentifier?: string; downloadUrl?: string }[] }[] };
  const docs = data?.documentBag;
  if (!Array.isArray(docs)) return null;

  const mapped: DocumentInfo[] = [];
  for (const doc of docs) {
    const downloads = doc.downloadOptionBag ?? [];
    const xmlDownload = downloads.find((d: { mimeTypeIdentifier?: string; downloadUrl?: string }) => d.mimeTypeIdentifier === 'XML');
    if (xmlDownload?.downloadUrl) {
      mapped.push({
        documentCode: doc.documentCode ?? '',
        officialDate: doc.officialDate ?? '',
        xmlUrl: xmlDownload.downloadUrl,
      });
    }
  }

  return mapped;
}

/**
 * Find the most recent CLM document with an XML download.
 * Documents are returned newest-first by the API.
 */
function findMostRecentClmDocument(documents: DocumentInfo[]): DocumentInfo | null {
  return documents.find((d) => d.documentCode === 'CLM') ?? null;
}

/**
 * Download a document XML archive (tar) and extract the .XML file content.
 * The ODP download endpoint returns a redirect URL in the response body,
 * which must be followed to get the actual tar archive.
 */
async function downloadAndExtractXml(downloadUrl: string, apiKey: string): Promise<string | null> {
  // First request: get redirect URL
  const redirectRes = await odpFetch(
    downloadUrl,
    {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    },
    apiKey,
    false,
  ); // Don't parse as JSON — check for redirect

  if (!redirectRes) return null;

  const contentType = redirectRes.headers.get('content-type') ?? '';
  let tarBuffer: ArrayBuffer;

  if (contentType.includes('application/x-tar') || contentType.includes('octet-stream')) {
    // Direct tar response (no redirect needed)
    tarBuffer = await redirectRes.arrayBuffer();
  } else {
    // Response body contains redirect URL
    const text = await redirectRes.text();
    const match = text.match(/https:\/\/[^\s"]+/);
    if (!match) {
      console.warn('[ODP-Claims] Could not extract redirect URL from response');
      return null;
    }

    const redirectUrl = match[0].replace(/\.$/, '');

    // Second request: download tar from redirect URL (no API key needed)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const tarRes = await fetch(redirectUrl, { signal: controller.signal });
      if (!tarRes.ok) {
        console.warn(`[ODP-Claims] Redirect download failed: HTTP ${tarRes.status}`);
        return null;
      }
      tarBuffer = await tarRes.arrayBuffer();
    } catch (err: unknown) {
      console.warn(`[ODP-Claims] Redirect download error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Extract .XML file from tar archive
  return extractXmlFromTar(Buffer.from(tarBuffer));
}

/**
 * Extract the first .XML file from a POSIX tar archive.
 * Tar format: 512-byte header blocks + data blocks.
 * Header: filename at bytes 0-99, file size at bytes 124-135 (octal).
 */
function extractXmlFromTar(buffer: Buffer): string | null {
  let offset = 0;
  const BLOCK_SIZE = 512;

  while (offset + BLOCK_SIZE <= buffer.length) {
    // Read filename from header (null-terminated string at offset 0, max 100 bytes)
    const nameEnd = buffer.indexOf(0, offset);
    const nameLen = Math.min((nameEnd >= 0 ? nameEnd : offset + 100) - offset, 100);
    const filename = buffer.subarray(offset, offset + nameLen).toString('utf-8');

    // Empty filename means end of archive
    if (!filename) break;

    // Read file size from header (octal string at bytes 124-135)
    const sizeStr = buffer
      .subarray(offset + 124, offset + 136)
      .toString('utf-8')
      .trim();
    const fileSize = parseInt(sizeStr, 8) || 0;

    // Data starts after header block
    const dataStart = offset + BLOCK_SIZE;
    const dataEnd = dataStart + fileSize;

    // Check if this is the .XML file we want
    if (filename.toUpperCase().endsWith('.XML')) {
      if (dataEnd <= buffer.length) {
        return buffer.subarray(dataStart, dataEnd).toString('utf-8');
      }
    }

    // Advance to next header (data rounded up to 512-byte blocks)
    const dataBlocks = Math.ceil(fileSize / BLOCK_SIZE);
    offset = dataStart + dataBlocks * BLOCK_SIZE;
  }

  return null;
}

/**
 * Parse claims from USPTO ST96 XML format.
 * Extracts active (non-canceled) claims with their text.
 *
 * XML structure:
 *   <uspat:Claims>
 *     <uspat:Claim com:id="CLM-00001">
 *       <pat:ClaimNumber>1</pat:ClaimNumber>
 *       <uspat:ClaimText>1. A method comprising...</uspat:ClaimText>
 *       <uspat:ClaimStatusCategory>Original</uspat:ClaimStatusCategory>
 *     </uspat:Claim>
 *   </uspat:Claims>
 */
export function parseClaimsFromXml(xml: string): ParsedClaim[] {
  const claims: ParsedClaim[] = [];

  // Match individual claim blocks
  const claimRegex = /<uspat:Claim[^>]*>([\s\S]*?)<\/uspat:Claim>/g;
  let match;

  while ((match = claimRegex.exec(xml)) !== null) {
    const claimBlock = match[1];

    // Check if canceled
    const statusMatch = claimBlock.match(/<uspat:ClaimStatusCategory>(.*?)<\/uspat:ClaimStatusCategory>/);
    const status = statusMatch?.[1] ?? '';
    if (status.toLowerCase().includes('cancel')) continue;

    // Extract claim number
    const numMatch = claimBlock.match(/<pat:ClaimNumber>(\d+)<\/pat:ClaimNumber>/);
    const claimNumber = numMatch ? parseInt(numMatch[1], 10) : 0;
    if (!claimNumber) continue;

    // Extract claim text (handle mixed content with nested tags)
    const textMatch = claimBlock.match(/<uspat:ClaimText>([\s\S]*?)<\/uspat:ClaimText>/);
    if (!textMatch) continue;

    // Strip XML tags and clean up the text
    let text = textMatch[1]
      .replace(/<[^>]+>/g, '') // Remove XML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Remove leading claim number + status prefix like "51. (Currently amended)"
    text = text.replace(/^\d+\.\s*(\([^)]*\)\s*)?/, '').trim();

    if (!text) continue;

    claims.push({ number: claimNumber, text });
  }

  // Sort by claim number
  claims.sort((a, b) => a.number - b.number);
  return claims;
}

/**
 * Wrapper for ODP API calls with timeout, rate limit handling, and error logging.
 */
async function odpFetch(url: string, options: RequestInit, apiKey: string, retried = false): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (res.status === 429) {
      if (!retried) {
        console.warn(`[ODP-Claims] Rate limited, waiting ${RETRY_DELAY_ON_429_MS / 1000}s...`);
        await sleep(RETRY_DELAY_ON_429_MS);
        clearTimeout(timer);
        return odpFetch(url, options, apiKey, true);
      }
      console.warn('[ODP-Claims] Rate limited after retry, giving up');
      return null;
    }

    if (!res.ok) {
      console.warn(`[ODP-Claims] HTTP ${res.status} for ${url}`);
      return null;
    }

    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[ODP-Claims] Timeout for ${url}`);
    } else {
      console.warn(`[ODP-Claims] Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
