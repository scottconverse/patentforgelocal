/**
 * Tests for the ODP Claims fetcher.
 * Mocks fetch to verify the multi-step flow:
 *   1. Search for application number
 *   2. Fetch documents list
 *   3. Download XML tar archive
 *   4. Parse claims from ST96 XML
 */

const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock global fetch
(global as any).fetch = mockFetch;

import { fetchClaimsFromODP, parseClaimsFromXml } from './odp-claims';

const FAKE_API_KEY = 'test-api-key-12345';

// --- Helper: build a minimal POSIX tar containing one XML file ---
function buildTarWithXml(xmlContent: string, filename = 'test.CLM.XML'): Buffer {
  const BLOCK = 512;
  const nameBuffer = Buffer.alloc(100);
  nameBuffer.write(filename, 'utf-8');

  const contentBuffer = Buffer.from(xmlContent, 'utf-8');
  const sizeOctal = contentBuffer.length.toString(8).padStart(11, '0');

  const header = Buffer.alloc(BLOCK);
  nameBuffer.copy(header, 0);
  header.write(sizeOctal, 124, 12, 'utf-8');

  const dataBlocks = Math.ceil(contentBuffer.length / BLOCK);
  const dataBuffer = Buffer.alloc(dataBlocks * BLOCK);
  contentBuffer.copy(dataBuffer, 0);

  // Two zero blocks to mark end of archive
  const endBlocks = Buffer.alloc(BLOCK * 2);
  return Buffer.concat([header, dataBuffer, endBlocks]);
}

// --- Helper: mock ODP search response ---
function mockSearchResponse(applicationNumber: string | null) {
  if (!applicationNumber) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ count: 0, patentFileWrapperDataBag: [] }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      count: 1,
      patentFileWrapperDataBag: [{ applicationNumberText: applicationNumber }],
    }),
  };
}

// --- Helper: mock documents list response ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible mock data
function mockDocumentsResponse(docs: any[] = []) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ count: docs.length, documentBag: docs }),
  };
}

// --- Helper: mock download redirect response ---
function mockRedirectResponse(redirectUrl: string) {
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'text/plain']]),
    text: async () => `Please use redirect URL to downoload: ${redirectUrl}. This URL is valid only for 3600 seconds.`,
  };
}

// --- Helper: mock tar download response ---
function mockTarResponse(xmlContent: string) {
  const tarBuffer = buildTarWithXml(xmlContent);
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/x-tar']]),
    arrayBuffer: async () => tarBuffer.buffer.slice(tarBuffer.byteOffset, tarBuffer.byteOffset + tarBuffer.byteLength),
  };
}

// --- Sample ST96 XML with claims ---
const SAMPLE_CLM_XML = `<?xml version="1.0" encoding="utf-8"?>
<uspat:ClaimsDocument xmlns:uspat="urn:us:gov:doc:uspto:patent"
  xmlns:pat="http://www.wipo.int/standards/XMLSchema/ST96/Patent"
  xmlns:com="http://www.wipo.int/standards/XMLSchema/ST96/Common"
  xmlns:uscom="urn:us:gov:doc:uspto:common">
<uspat:Claims com:id="CLM-00000">
  <uspat:Claim com:id="CLM-00001">
    <pat:ClaimNumber>1</pat:ClaimNumber>
    <uspat:ClaimText>1. A method for processing data comprising: receiving input; transforming the input; and outputting results.</uspat:ClaimText>
    <uspat:ClaimStatusCategory>Original</uspat:ClaimStatusCategory>
  </uspat:Claim>
  <uspat:Claim com:id="CLM-00002">
    <pat:ClaimNumber>2</pat:ClaimNumber>
    <uspat:ClaimText>2. The method of claim 1, wherein the input is digital data.</uspat:ClaimText>
    <uspat:ClaimStatusCategory>Original</uspat:ClaimStatusCategory>
  </uspat:Claim>
  <uspat:Claim com:id="CLM-00003">
    <pat:ClaimNumber>3</pat:ClaimNumber>
    <uspat:ClaimText>3. (Canceled)</uspat:ClaimText>
    <uspat:ClaimStatusCategory>Canceled</uspat:ClaimStatusCategory>
  </uspat:Claim>
  <uspat:Claim com:id="CLM-00004">
    <pat:ClaimNumber>4</pat:ClaimNumber>
    <uspat:ClaimText>4. (Currently amended) An apparatus comprising: a processor; and a memory storing instructions.</uspat:ClaimText>
    <uspat:ClaimStatusCategory>Currently amended</uspat:ClaimStatusCategory>
  </uspat:Claim>
</uspat:Claims>
</uspat:ClaimsDocument>`;

beforeEach(() => {
  mockFetch.mockReset();
});

// ==========================================
// Unit tests for parseClaimsFromXml
// ==========================================

describe('parseClaimsFromXml', () => {
  it('extracts active claims and filters canceled ones', () => {
    const claims = parseClaimsFromXml(SAMPLE_CLM_XML);

    expect(claims).toHaveLength(3);
    expect(claims[0].number).toBe(1);
    expect(claims[1].number).toBe(2);
    expect(claims[2].number).toBe(4);
  });

  it('strips claim number prefix and status annotation from text', () => {
    const claims = parseClaimsFromXml(SAMPLE_CLM_XML);

    expect(claims[0].text).toBe(
      'A method for processing data comprising: receiving input; transforming the input; and outputting results.',
    );
    expect(claims[2].text).toBe('An apparatus comprising: a processor; and a memory storing instructions.');
  });

  it('strips dependent claim prefix', () => {
    const claims = parseClaimsFromXml(SAMPLE_CLM_XML);

    expect(claims[1].text).toBe('The method of claim 1, wherein the input is digital data.');
  });

  it('sorts claims by number', () => {
    const xml = `<uspat:Claims xmlns:uspat="urn:us:gov:doc:uspto:patent"
      xmlns:pat="http://www.wipo.int/standards/XMLSchema/ST96/Patent">
      <uspat:Claim><pat:ClaimNumber>5</pat:ClaimNumber>
        <uspat:ClaimText>5. Claim five.</uspat:ClaimText>
        <uspat:ClaimStatusCategory>Original</uspat:ClaimStatusCategory></uspat:Claim>
      <uspat:Claim><pat:ClaimNumber>2</pat:ClaimNumber>
        <uspat:ClaimText>2. Claim two.</uspat:ClaimText>
        <uspat:ClaimStatusCategory>Original</uspat:ClaimStatusCategory></uspat:Claim>
    </uspat:Claims>`;

    const claims = parseClaimsFromXml(xml);
    expect(claims[0].number).toBe(2);
    expect(claims[1].number).toBe(5);
  });

  it('handles mixed content with nested XML tags', () => {
    const xml = `<uspat:Claims xmlns:uspat="urn:us:gov:doc:uspto:patent"
      xmlns:pat="http://www.wipo.int/standards/XMLSchema/ST96/Patent"
      xmlns:com="http://www.wipo.int/standards/XMLSchema/ST96/Common"
      xmlns:uscom="urn:us:gov:doc:uspto:common">
      <uspat:Claim><pat:ClaimNumber>1</pat:ClaimNumber>
        <uspat:ClaimText>1. A method <com:Ins>with inserted text</com:Ins> and <uscom:OCRConfidenceData>more</uscom:OCRConfidenceData> content.</uspat:ClaimText>
        <uspat:ClaimStatusCategory>Currently amended</uspat:ClaimStatusCategory></uspat:Claim>
    </uspat:Claims>`;

    const claims = parseClaimsFromXml(xml);
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toBe('A method with inserted text and more content.');
  });

  it('handles XML entities', () => {
    const xml = `<uspat:Claims xmlns:uspat="urn:us:gov:doc:uspto:patent"
      xmlns:pat="http://www.wipo.int/standards/XMLSchema/ST96/Patent">
      <uspat:Claim><pat:ClaimNumber>1</pat:ClaimNumber>
        <uspat:ClaimText>1. A value &lt; 100 &amp; &gt; 0.</uspat:ClaimText>
        <uspat:ClaimStatusCategory>Original</uspat:ClaimStatusCategory></uspat:Claim>
    </uspat:Claims>`;

    const claims = parseClaimsFromXml(xml);
    expect(claims[0].text).toBe('A value < 100 & > 0.');
  });

  it('returns empty array for XML with no claims', () => {
    const claims = parseClaimsFromXml('<root></root>');
    expect(claims).toEqual([]);
  });

  it('returns empty array for XML with only canceled claims', () => {
    const xml = `<uspat:Claims xmlns:uspat="urn:us:gov:doc:uspto:patent"
      xmlns:pat="http://www.wipo.int/standards/XMLSchema/ST96/Patent">
      <uspat:Claim><pat:ClaimNumber>1</pat:ClaimNumber>
        <uspat:ClaimText>1. (Canceled)</uspat:ClaimText>
        <uspat:ClaimStatusCategory>Canceled</uspat:ClaimStatusCategory></uspat:Claim>
    </uspat:Claims>`;

    const claims = parseClaimsFromXml(xml);
    expect(claims).toEqual([]);
  });
});

// ==========================================
// Integration tests for fetchClaimsFromODP
// ==========================================

describe('fetchClaimsFromODP', () => {
  it('fetches claims through the full pipeline', async () => {
    // Mock 1: Search for application number
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    // Mock 2: Fetch documents list
    mockFetch.mockResolvedValueOnce(
      mockDocumentsResponse([
        {
          documentCode: 'CLM',
          officialDate: '2024-01-16',
          downloadOptionBag: [
            { mimeTypeIdentifier: 'PDF', downloadUrl: 'https://api.uspto.gov/download/test.pdf' },
            { mimeTypeIdentifier: 'XML', downloadUrl: 'https://api.uspto.gov/download/test/xmlarchive' },
          ],
        },
      ]),
    );
    // Mock 3: Download redirect
    mockFetch.mockResolvedValueOnce(
      mockRedirectResponse('https://data-documents.uspto.gov/redirect/download/test/xmlarchive?id=abc'),
    );
    // Mock 4: Download tar
    mockFetch.mockResolvedValueOnce(mockTarResponse(SAMPLE_CLM_XML));

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);

    expect(result).not.toBeNull();
    expect(result!.claimCount).toBe(3); // 1, 2, 4 (3 is canceled)
    expect(result!.claims[0].number).toBe(1);
    expect(result!.claims[0].text).toContain('A method for processing data');
    expect(result!.claimsText).toContain('1. A method for processing data');
    expect(result!.claimsText).toContain('4. An apparatus comprising');
  });

  it('returns null when patent not found in search', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse(null));

    const result = await fetchClaimsFromODP('US99999999', FAKE_API_KEY);
    expect(result).toBeNull();
  });

  it('returns null when no documents found', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(mockDocumentsResponse([]));

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);
    expect(result).toBeNull();
  });

  it('returns null when no CLM document has XML', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(
      mockDocumentsResponse([
        {
          documentCode: 'SPEC',
          officialDate: '2024-01-16',
          downloadOptionBag: [{ mimeTypeIdentifier: 'XML', downloadUrl: 'https://api.uspto.gov/download/spec.xml' }],
        },
      ]),
    );

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);
    expect(result).toBeNull();
  });

  it('uses most recent CLM document (first in list)', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(
      mockDocumentsResponse([
        {
          documentCode: 'CLM',
          officialDate: '2024-01-16',
          downloadOptionBag: [
            { mimeTypeIdentifier: 'XML', downloadUrl: 'https://api.uspto.gov/download/clm-latest/xmlarchive' },
          ],
        },
        {
          documentCode: 'CLM',
          officialDate: '2023-07-14',
          downloadOptionBag: [
            { mimeTypeIdentifier: 'XML', downloadUrl: 'https://api.uspto.gov/download/clm-old/xmlarchive' },
          ],
        },
      ]),
    );
    mockFetch.mockResolvedValueOnce(mockRedirectResponse('https://data-documents.uspto.gov/redirect/test'));
    mockFetch.mockResolvedValueOnce(mockTarResponse(SAMPLE_CLM_XML));

    await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);

    // Third call should be for the first (newest) CLM document
    expect(mockFetch.mock.calls[2][0]).toBe('https://api.uspto.gov/download/clm-latest/xmlarchive');
  });

  it('handles direct tar response (no redirect)', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(
      mockDocumentsResponse([
        {
          documentCode: 'CLM',
          officialDate: '2024-01-16',
          downloadOptionBag: [
            { mimeTypeIdentifier: 'XML', downloadUrl: 'https://api.uspto.gov/download/test/xmlarchive' },
          ],
        },
      ]),
    );
    // Direct tar response (content-type indicates tar)
    const tarBuffer = buildTarWithXml(SAMPLE_CLM_XML);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/x-tar']]),
      arrayBuffer: async () =>
        tarBuffer.buffer.slice(tarBuffer.byteOffset, tarBuffer.byteOffset + tarBuffer.byteLength),
    });

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);
    expect(result).not.toBeNull();
    expect(result!.claimCount).toBe(3);
  });

  it('returns null on search API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);
    expect(result).toBeNull();
  });

  it('returns null on documents API error', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);
    expect(result).toBeNull();
  });

  it('returns null on download error', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(
      mockDocumentsResponse([
        {
          documentCode: 'CLM',
          officialDate: '2024-01-16',
          downloadOptionBag: [
            { mimeTypeIdentifier: 'XML', downloadUrl: 'https://api.uspto.gov/download/test/xmlarchive' },
          ],
        },
      ]),
    );
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);
    expect(result).toBeNull();
  });

  it('handles 429 rate limiting with retry', async () => {
    // Search: rate limited first, then succeeds
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(
      mockDocumentsResponse([
        {
          documentCode: 'CLM',
          officialDate: '2024-01-16',
          downloadOptionBag: [
            { mimeTypeIdentifier: 'XML', downloadUrl: 'https://api.uspto.gov/download/test/xmlarchive' },
          ],
        },
      ]),
    );
    mockFetch.mockResolvedValueOnce(mockRedirectResponse('https://data-documents.uspto.gov/redirect/test'));
    mockFetch.mockResolvedValueOnce(mockTarResponse(SAMPLE_CLM_XML));

    const result = await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);
    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(5); // 429 + retry + docs + redirect + tar
  }, 15000);

  it('sends correct API key header in all requests', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(mockDocumentsResponse([]));

    await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);

    // Search request
    expect(mockFetch.mock.calls[0][1].headers['X-API-Key']).toBe(FAKE_API_KEY);
    // Documents request
    expect(mockFetch.mock.calls[1][1].headers['X-API-Key']).toBe(FAKE_API_KEY);
  });

  it('constructs correct documents URL from application number', async () => {
    mockFetch.mockResolvedValueOnce(mockSearchResponse('18045436'));
    mockFetch.mockResolvedValueOnce(mockDocumentsResponse([]));

    await fetchClaimsFromODP('US12000000B2', FAKE_API_KEY);

    expect(mockFetch.mock.calls[1][0]).toBe('https://api.uspto.gov/api/v1/patent/applications/18045436/documents');
  });
});
