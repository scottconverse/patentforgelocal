/**
 * Tests for the USPTO Open Data Portal (ODP) continuity client.
 * Mocks fetch to verify patent family lookup and relationship mapping.
 */

const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock global fetch
(global as any).fetch = mockFetch;

import { fetchPatentFamilyODP } from './odp-continuity';

const FAKE_API_KEY = 'test-api-key-12345';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible mock overrides
function makeContinuityBag(overrides: any = {}) {
  return {
    applicationNumberText: '18045436',
    applicationMetaData: {
      patentNumber: '12000000',
      inventionTitle: 'Multi-Camera Defect Detection System',
      grantDate: '2024-06-04',
      filingDate: '2022-10-10',
    },
    continuityBag: overrides.continuityBag ?? [
      {
        claimType: 'Continuation',
        parentApplicationBag: [
          {
            applicationNumberText: '16123456',
            patentNumber: '11500000',
            filingDate: '2020-03-15',
            grantDate: '2022-01-10',
            inventionTitle: 'Camera Defect Detection Apparatus',
          },
        ],
      },
      {
        claimType: 'Divisional',
        childApplicationBag: [
          {
            applicationNumberText: '18678901',
            patentNumber: null,
            filingDate: '2024-08-01',
            inventionTitle: 'Specialized Lens Assembly for Defect Detection',
            applicationStatusDescriptionText: 'pending',
          },
        ],
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

describe('fetchPatentFamilyODP', () => {
  it('sends POST request searching by patent number with continuityBag field', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeContinuityBag()]));

    await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.uspto.gov/api/v1/patent/applications/search');
    expect(options.headers['X-API-Key']).toBe(FAKE_API_KEY);

    const body = JSON.parse(options.body);
    expect(body.q).toContain('applicationMetaData.patentNumber:12000000');
    expect(body.fields).toContain('continuityBag');
  });

  it('strips US prefix and letter suffix from patent number', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeContinuityBag()]));

    await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.q).toContain('12000000');
    expect(body.q).not.toContain('US');
    expect(body.q).not.toContain('B2');
  });

  it('parses parent applications from continuityBag', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeContinuityBag()]));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result).not.toBeNull();
    const parent = result!.find((m) => m.patentNumber === '11500000');
    expect(parent).toBeTruthy();
    expect(parent!.relationship).toBe('continuation');
    expect(parent!.filingDate).toBe('2020-03-15');
    expect(parent!.grantDate).toBe('2022-01-10');
    expect(parent!.title).toBe('Camera Defect Detection Apparatus');
    expect(parent!.status).toBe('granted');
  });

  it('parses child applications from continuityBag', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeContinuityBag()]));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result).not.toBeNull();
    const child = result!.find((m) => m.applicationNumber === '18678901');
    expect(child).toBeTruthy();
    expect(child!.relationship).toBe('divisional');
    expect(child!.patentNumber).toBeNull();
    expect(child!.filingDate).toBe('2024-08-01');
    expect(child!.status).toBe('pending');
  });

  it('deduplicates members by patent number or application number', async () => {
    const bag = makeContinuityBag({
      continuityBag: [
        {
          claimType: 'Continuation',
          parentApplicationBag: [
            { applicationNumberText: '16123456', patentNumber: '11500000', filingDate: '2020-03-15' },
          ],
        },
        {
          claimType: 'Continuation',
          parentApplicationBag: [
            { applicationNumberText: '16123456', patentNumber: '11500000', filingDate: '2020-03-15' },
          ],
        },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeODPResponse([bag]));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result).toHaveLength(1);
  });

  it('returns empty array when no continuity data present', async () => {
    const bag = makeContinuityBag({ continuityBag: [] });
    mockFetch.mockResolvedValueOnce(makeODPResponse([bag]));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result).not.toBeNull();
    expect(result).toEqual([]);
  });

  it('returns null when patent not found', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([]));

    const result = await fetchPatentFamilyODP('US99999999', FAKE_API_KEY);

    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result).toBeNull();
  });

  it('handles 429 with retry', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(makeODPResponse([makeContinuityBag()]));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  }, 20000);

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result).toBeNull();
  });

  it('maps continuation-in-part relationship type', async () => {
    const bag = makeContinuityBag({
      continuityBag: [
        {
          claimType: 'Continuation-In-Part',
          parentApplicationBag: [
            { applicationNumberText: '15999999', patentNumber: '10800000', filingDate: '2019-01-01' },
          ],
        },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeODPResponse([bag]));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result![0].relationship).toBe('continuation-in-part');
  });

  it('handles parentApplicationBag at top level of bag', async () => {
    const bag = {
      applicationNumberText: '18045436',
      applicationMetaData: { patentNumber: '12000000' },
      continuityBag: [],
      parentApplicationBag: [
        {
          applicationNumberText: '16123456',
          patentNumber: '11500000',
          filingDate: '2020-03-15',
          continuityType: 'Continuation',
        },
      ],
    };
    mockFetch.mockResolvedValueOnce(makeODPResponse([bag]));

    const result = await fetchPatentFamilyODP('US12000000B2', FAKE_API_KEY);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0].patentNumber).toBe('11500000');
  });
});
