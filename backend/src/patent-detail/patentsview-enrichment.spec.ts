import { fetchEnrichedPatent } from './patentsview-enrichment';

// Mock global fetch
const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock global fetch
global.fetch = mockFetch as any;

afterEach(() => {
  mockFetch.mockReset();
});

describe('fetchEnrichedPatent', () => {
  const SAMPLE_RESPONSE = {
    patents: [
      {
        patent_id: '10234567',
        patent_title: 'Method for AI-Powered Widget Assembly',
        patent_abstract: 'A system and method for assembling widgets using machine learning.',
        patent_date: '2023-06-15',
        patent_type: 'utility',
        patent_num_claims: 12,
        application: [{ filing_date: '2021-03-20' }],
        assignees: [
          {
            assignee_organization: 'Acme Corp',
            assignee_individual_name_first: null,
            assignee_individual_name_last: null,
          },
          { assignee_organization: null, assignee_individual_name_first: 'Jane', assignee_individual_name_last: 'Doe' },
        ],
        inventors: [
          { inventor_name_first: 'John', inventor_name_last: 'Smith' },
          { inventor_name_first: 'Alice', inventor_name_last: 'Johnson' },
        ],
        cpc_current: [
          { cpc_group_id: 'G06N3/08', cpc_group_title: 'Learning methods' },
          { cpc_group_id: 'G06F16/00', cpc_group_title: 'Information retrieval' },
          { cpc_group_id: 'G06N3/08', cpc_group_title: 'Learning methods' }, // duplicate
        ],
        claims: [
          { claim_number: 1, claim_text: 'A method comprising training a neural network...' },
          { claim_number: 3, claim_text: 'The method of claim 1, wherein the network is a transformer.' },
          { claim_number: 2, claim_text: 'The method of claim 1, further comprising a validation step.' },
        ],
      },
    ],
  };

  it('parses a complete patent response correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_RESPONSE,
    });

    const result = await fetchEnrichedPatent('US10234567B2');
    expect(result).not.toBeNull();
    expect(result!.patentNumber).toBe('US10234567B2');
    expect(result!.title).toBe('Method for AI-Powered Widget Assembly');
    expect(result!.grantDate).toBe('2023-06-15');
    expect(result!.filingDate).toBe('2021-03-20');
    expect(result!.patentType).toBe('utility');
    expect(result!.claimCount).toBe(12);
  });

  it('extracts assignees (org and individual)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_RESPONSE,
    });

    const result = await fetchEnrichedPatent('US10234567B2');
    expect(result!.assignees).toEqual(['Acme Corp', 'Jane Doe']);
  });

  it('extracts and deduplicates CPC classifications', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_RESPONSE,
    });

    const result = await fetchEnrichedPatent('US10234567B2');
    expect(result!.cpcClassifications).toHaveLength(2); // deduplicated from 3
    expect(result!.cpcClassifications[0].code).toBe('G06N3/08');
    expect(result!.cpcClassifications[1].code).toBe('G06F16/00');
  });

  it('sorts claims by number', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_RESPONSE,
    });

    const result = await fetchEnrichedPatent('US10234567B2');
    expect(result!.claims).toHaveLength(3);
    expect(result!.claims[0].number).toBe(1);
    expect(result!.claims[1].number).toBe(2);
    expect(result!.claims[2].number).toBe(3);
  });

  it('extracts inventors', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_RESPONSE,
    });

    const result = await fetchEnrichedPatent('US10234567B2');
    expect(result!.inventors).toEqual(['John Smith', 'Alice Johnson']);
  });

  it('returns null when patent is not found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ patents: [] }),
    });

    const result = await fetchEnrichedPatent('US99999999');
    expect(result).toBeNull();
  });

  it('returns null on null patents array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ patents: null }),
    });

    const result = await fetchEnrichedPatent('US99999999');
    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await fetchEnrichedPatent('US10234567');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fetchEnrichedPatent('US10234567');
    expect(result).toBeNull();
  });

  it('strips US prefix and letter suffix when querying', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ patents: null }),
    });

    await fetchEnrichedPatent('US10234567B2');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.q.patent_id).toBe('10234567');
  });

  it('returns null when API returns migration error', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        error: true,
        message: 'PatentsView is migrating to the USPTO Open Data Portal (ODP, available at data.uspto.gov).',
      }),
    });

    const result = await fetchEnrichedPatent('US10234567B2');
    expect(result).toBeNull();
  });

  it('handles missing optional fields gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        patents: [
          {
            patent_id: '10234567',
            patent_title: 'Test',
            // No abstract, assignees, inventors, claims, cpc, application
          },
        ],
      }),
    });

    const result = await fetchEnrichedPatent('10234567');
    expect(result).not.toBeNull();
    expect(result!.assignees).toEqual([]);
    expect(result!.inventors).toEqual([]);
    expect(result!.cpcClassifications).toEqual([]);
    expect(result!.claims).toEqual([]);
    expect(result!.filingDate).toBeNull();
    expect(result!.abstract).toBeNull();
  });
});
