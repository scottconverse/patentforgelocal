import { searchPatentsViewMulti, PatentsViewMigrationError } from './patentsview-client';

const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock global fetch
global.fetch = mockFetch as any;

afterEach(() => {
  mockFetch.mockReset();
});

describe('searchPatentsViewMulti', () => {
  it('returns combined results from multiple queries', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        patents: [
          {
            patent_id: '123',
            patent_title: 'Test A',
            patent_abstract: 'Abstract A',
            patent_date: '2023-01-01',
            patent_type: 'utility',
          },
        ],
      }),
    });

    const results = await searchPatentsViewMulti(['test query']);
    expect(results).toHaveLength(1);
    expect(results[0].patent_id).toBe('123');
  });

  it('deduplicates patents across queries', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          patents: [
            {
              patent_id: '123',
              patent_title: 'Same Patent',
              patent_abstract: null,
              patent_date: null,
              patent_type: null,
            },
          ],
        }),
      };
    });

    const results = await searchPatentsViewMulti(['query 1', 'query 2']);
    expect(results).toHaveLength(1); // deduplicated
    expect(callCount).toBe(2); // both queries ran
  });

  it('throws PatentsViewMigrationError when API returns migration message', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        error: true,
        message:
          'PatentsView is migrating to the USPTO Open Data Portal (ODP, available at data.uspto.gov). Please visit data.uspto.gov/support/transition-guidance/patentsview for more information.',
      }),
    });

    await expect(searchPatentsViewMulti(['test query'])).rejects.toThrow(PatentsViewMigrationError);
    await expect(searchPatentsViewMulti(['test query'])).rejects.toThrow('shut down and migrated');
  });

  it('swallows non-migration errors and continues', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Network timeout');
      return {
        ok: true,
        json: async () => ({
          patents: [
            { patent_id: '456', patent_title: 'Result', patent_abstract: null, patent_date: null, patent_type: null },
          ],
        }),
      };
    });

    const results = await searchPatentsViewMulti(['bad query', 'good query']);
    expect(results).toHaveLength(1);
    expect(results[0].patent_id).toBe('456');
  });

  it('handles empty patents array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ patents: [] }),
    });

    const results = await searchPatentsViewMulti(['query']);
    expect(results).toHaveLength(0);
  });

  it('handles null patents', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ patents: null }),
    });

    const results = await searchPatentsViewMulti(['query']);
    expect(results).toHaveLength(0);
  });
});
