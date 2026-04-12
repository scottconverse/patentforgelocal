/**
 * Tests for the USPTO Open Data Portal (ODP) enrichment client.
 * Mocks fetch to verify patent number lookup and field mapping.
 */

const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock global fetch
(global as any).fetch = mockFetch;

import { fetchEnrichedPatentODP } from './odp-enrichment';

const FAKE_API_KEY = 'test-api-key-12345';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible mock overrides
function makeODPBag(overrides: any = {}) {
  return {
    applicationNumberText: '18045436',
    applicationMetaData: {
      inventionTitle: 'Multi-Camera Defect Detection System',
      patentNumber: '12000000',
      grantDate: '2024-06-04',
      filingDate: '2022-10-10',
      effectiveFilingDate: '2022-10-10',
      applicationTypeLabelName: 'Utility',
      cpcClassificationBag: ['G06N3/08', 'G06T7/00', 'G01N21/88'],
      inventorBag: [
        { firstName: 'John', lastName: 'Smith', inventorNameText: 'John Smith' },
        { firstName: 'Jane', lastName: 'Doe', inventorNameText: 'Jane Doe' },
      ],
      firstApplicantName: 'Acme Vision Corp',
      applicantBag: [{ applicantNameText: 'Acme Vision Corp' }],
      publicationCategoryBag: ['Granted/Issued'],
      ...overrides.applicationMetaData,
    },
    assignmentBag: overrides.assignmentBag ?? [
      {
        assigneeBag: [{ assigneeNameText: 'ACME VISION CORP' }],
      },
    ],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible mock data
function makeODPResponse(bags: any[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      count: bags.length,
      patentFileWrapperDataBag: bags,
    }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchEnrichedPatentODP', () => {
  it('sends POST request searching by patent number', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.uspto.gov/api/v1/patent/applications/search');
    expect(options.headers['X-API-Key']).toBe(FAKE_API_KEY);

    const body = JSON.parse(options.body);
    expect(body.q).toContain('applicationMetaData.patentNumber:12000000');
    expect(body.pagination.limit).toBe(1);
  });

  it('strips US prefix and letter suffix from patent number', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.q).toContain('12000000');
    expect(body.q).not.toContain('US');
    expect(body.q).not.toContain('B2');
  });

  it('maps all metadata fields correctly', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result).not.toBeNull();
    expect(result!.patentNumber).toBe('US12000000B2');
    expect(result!.title).toBe('Multi-Camera Defect Detection System');
    expect(result!.grantDate).toBe('2024-06-04');
    expect(result!.filingDate).toBe('2022-10-10');
    expect(result!.patentType).toBe('utility');
  });

  it('extracts inventors from inventorBag', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result!.inventors).toEqual(['John Smith', 'Jane Doe']);
  });

  it('extracts assignees from assignmentBag', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result!.assignees).toEqual(['ACME VISION CORP']);
  });

  it('falls back to firstApplicantName when no assignmentBag', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag({ assignmentBag: [] })]));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result!.assignees).toEqual(['Acme Vision Corp']);
  });

  it('extracts CPC classifications as code strings', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result!.cpcClassifications).toEqual([
      { code: 'G06N3/08', title: '' },
      { code: 'G06T7/00', title: '' },
      { code: 'G01N21/88', title: '' },
    ]);
  });

  it('sets claims to empty (not available in ODP metadata)', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result!.claims).toEqual([]);
    expect(result!.claimCount).toBe(0);
    expect(result!.abstract).toBeNull();
  });

  it('returns null when patent not found', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([]));

    const result = await fetchEnrichedPatentODP('US99999999', FAKE_API_KEY);

    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result).toBeNull();
  });

  it('handles 429 with retry', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce(makeODPResponse([makeODPBag()]));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Multi-Camera Defect Detection System');
  }, 20000);

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result).toBeNull();
  });

  it('deduplicates CPC codes', async () => {
    mockFetch.mockResolvedValueOnce(
      makeODPResponse([
        makeODPBag({
          applicationMetaData: {
            cpcClassificationBag: ['G06N3/08', 'G06N3/08', 'G06T7/00'],
          },
        }),
      ]),
    );

    const result = await fetchEnrichedPatentODP('US12000000B2', FAKE_API_KEY);

    expect(result!.cpcClassifications).toHaveLength(2);
  });
});
