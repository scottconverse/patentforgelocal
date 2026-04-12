/**
 * Tests for the USPTO Open Data Portal (ODP) search client.
 * Mocks fetch to verify query construction, rate limit handling,
 * and response mapping without hitting the real API.
 */

// Mock global fetch before importing the module
const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock global fetch
(global as any).fetch = mockFetch;

import { searchODPMulti } from './odp-client';

const FAKE_API_KEY = 'test-api-key-12345';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible mock data
function makeODPResponse(results: any[], count = results.length) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      count,
      patentFileWrapperDataBag: results,
      requestIdentifier: 'test-req-id',
    }),
  };
}

function makeODPPatent(patentNumber: string, title: string, grantDate = '2024-01-15') {
  return {
    applicationNumberText: '18' + patentNumber.slice(0, 6),
    applicationMetaData: {
      inventionTitle: title,
      patentNumber,
      grantDate,
      filingDate: '2022-03-10',
      applicationTypeLabelName: 'Utility',
      cpcClassificationBag: ['G06N3/08', 'G06T7/00'],
      inventorBag: [{ firstName: 'John', lastName: 'Smith', inventorNameText: 'John Smith' }],
      firstApplicantName: 'Acme Corp',
      publicationCategoryBag: ['Granted/Issued'],
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('searchODPMulti', () => {
  it('sends POST request with correct body structure', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([]));

    await searchODPMulti(['defect detection'], FAKE_API_KEY);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.uspto.gov/api/v1/patent/applications/search');
    expect(options.method).toBe('POST');
    expect(options.headers['X-API-Key']).toBe(FAKE_API_KEY);
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.q).toContain('applicationMetaData.inventionTitle');
    expect(body.q).toContain('defect detection');
    expect(body.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'applicationMetaData.applicationTypeLabelName', value: ['Utility'] }),
        expect.objectContaining({ name: 'applicationMetaData.publicationCategoryBag', value: ['Granted/Issued'] }),
      ]),
    );
    expect(body.pagination).toEqual({ offset: 0, limit: 25 });
  });

  it('maps ODP results to PatentsViewPatent format', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([makeODPPatent('10234567', 'Widget Defect Detector')]));

    const { results } = await searchODPMulti(['widget defect'], FAKE_API_KEY);

    expect(results).toHaveLength(1);
    expect(results[0].patent_id).toBe('US10234567');
    expect(results[0].patent_title).toBe('Widget Defect Detector');
    expect(results[0].patent_date).toBe('2024-01-15');
    expect(results[0].patent_type).toBe('Utility');
  });

  it('deduplicates results across multiple queries with inter-query delay', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockFetch
      .mockResolvedValueOnce(
        makeODPResponse([makeODPPatent('10234567', 'Widget A'), makeODPPatent('10234568', 'Widget B')]),
      )
      .mockResolvedValueOnce(
        makeODPResponse([
          makeODPPatent('10234567', 'Widget A'), // duplicate
          makeODPPatent('10234569', 'Widget C'),
        ]),
      );

    const resultPromise = searchODPMulti(['query one', 'query two'], FAKE_API_KEY);
    // First query fires immediately; second waits 1.5s
    await jest.advanceTimersByTimeAsync(2_000);
    const { results } = await resultPromise;

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.patent_id)).toEqual(['US10234567', 'US10234568', 'US10234569']);
    // Verify the inter-query delay was respected (setTimeout called with 1500ms)
    const delayCalls = setTimeoutSpy.mock.calls.filter((c) => c[1] === 1500);
    expect(delayCalls.length).toBeGreaterThanOrEqual(1);
    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  it('skips results without patent numbers (ungranted applications)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeODPResponse([
        {
          applicationNumberText: '18123456',
          applicationMetaData: {
            inventionTitle: 'Pending Application',
            // no patentNumber — not yet granted
            filingDate: '2024-01-01',
          },
        },
        makeODPPatent('10234567', 'Granted Patent'),
      ]),
    );

    const { results } = await searchODPMulti(['test'], FAKE_API_KEY);

    expect(results).toHaveLength(1);
    expect(results[0].patent_id).toBe('US10234567');
  });

  it('limits to 3 queries maximum with delays between each', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockFetch
      .mockResolvedValueOnce(makeODPResponse([]))
      .mockResolvedValueOnce(makeODPResponse([]))
      .mockResolvedValueOnce(makeODPResponse([]));

    const resultPromise = searchODPMulti(['q1', 'q2', 'q3', 'q4', 'q5'], FAKE_API_KEY);
    // 3 queries with 1.5s gaps: need at least 3s for all to complete
    await jest.advanceTimersByTimeAsync(5_000);
    await resultPromise;

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Verify two inter-query delays of 1500ms (queries 2 and 3 each wait)
    const delayCalls = setTimeoutSpy.mock.calls.filter((c) => c[1] === 1500);
    expect(delayCalls).toHaveLength(2);
    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  it('handles HTTP 429 with retry after delay', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(makeODPResponse([makeODPPatent('10234567', 'After Retry')]));

    const resultPromise = searchODPMulti(['test'], FAKE_API_KEY);
    // Advance past the 10-second retry delay and the 1.5-second inter-query delay
    await jest.advanceTimersByTimeAsync(12_000);
    const { results, metadata } = await resultPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
    expect(results[0].patent_title).toBe('After Retry');
    expect(metadata.hadRateLimit).toBe(true);
    // Verify the 429 retry used a 10-second delay
    const retryCalls = setTimeoutSpy.mock.calls.filter((c) => c[1] === 10_000);
    expect(retryCalls.length).toBeGreaterThanOrEqual(1);
    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  it('gives up after max retries on 429', async () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce({ ok: false, status: 429 });

    const resultPromise = searchODPMulti(['test'], FAKE_API_KEY);
    await jest.advanceTimersByTimeAsync(12_000);
    const { results, metadata } = await resultPromise;

    expect(results).toHaveLength(0);
    expect(metadata.hadRateLimit).toBe(true);
    jest.useRealTimers();
  });

  it('handles HTTP 403 (bad API key) gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const { results } = await searchODPMulti(['test'], FAKE_API_KEY);

    expect(results).toHaveLength(0);
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const { results } = await searchODPMulti(['test'], FAKE_API_KEY);

    expect(results).toHaveLength(0);
  });

  it('returns empty array when API returns no results', async () => {
    mockFetch.mockResolvedValueOnce(makeODPResponse([]));

    const { results } = await searchODPMulti(['nonexistent patent topic'], FAKE_API_KEY);

    expect(results).toHaveLength(0);
  });
});
