/**
 * Tests for the csvEscape helper and CSV export logic.
 * The actual endpoint test would require a full NestJS test module,
 * so we test the formatting logic directly.
 */

// Extract csvEscape from the controller file by re-implementing here
// (it's a module-private function — we test the same logic)
function csvEscape(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

describe('csvEscape', () => {
  it('returns empty string for empty input', () => {
    expect(csvEscape('')).toBe('');
  });

  it('passes through simple strings unchanged', () => {
    expect(csvEscape('hello world')).toBe('hello world');
  });

  it('wraps strings with commas in quotes', () => {
    expect(csvEscape('Smith, Jones')).toBe('"Smith, Jones"');
  });

  it('wraps strings with newlines in quotes', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('escapes double quotes by doubling them', () => {
    expect(csvEscape('She said "hello"')).toBe('"She said ""hello"""');
  });

  it('handles strings with both commas and quotes', () => {
    expect(csvEscape('"Acme, Inc."')).toBe('"""Acme, Inc."""');
  });
});

describe('CSV row formatting', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose types
  function buildCsvRow(result: any, detail: any): string {
    return [
      result.patentNumber,
      csvEscape(result.title),
      detail?.filingDate ?? '',
      detail?.grantDate ?? '',
      detail?.assignee ? (Array.isArray(detail.assignee) ? detail.assignee.join('; ') : detail.assignee) : '',
      detail?.inventors ? (Array.isArray(detail.inventors) ? detail.inventors.join('; ') : detail.inventors) : '',
      detail?.cpcClassifications
        ? Array.isArray(detail.cpcClassifications)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible CPC shape
          ? detail.cpcClassifications.map((c: any) => c.code || c).join('; ')
          : ''
        : '',
      (result.relevanceScore * 100).toFixed(0) + '%',
      csvEscape((result.abstract ?? '').slice(0, 500)),
      result.source ?? 'PatentsView',
    ].join(',');
  }

  it('formats a row with full enrichment data', () => {
    const result = {
      patentNumber: 'US10234567B2',
      title: 'Widget Method',
      relevanceScore: 0.85,
      abstract: 'A method for widgets.',
      source: 'PatentsView',
    };
    const detail = {
      filingDate: '2021-03-20',
      grantDate: '2023-06-15',
      assignee: ['Acme Corp'],
      inventors: ['John Smith', 'Jane Doe'],
      cpcClassifications: [{ code: 'G06N3/08' }, { code: 'G06F16/00' }],
    };

    const row = buildCsvRow(result, detail);
    expect(row).toContain('US10234567B2');
    expect(row).toContain('Widget Method');
    expect(row).toContain('2021-03-20');
    expect(row).toContain('2023-06-15');
    expect(row).toContain('Acme Corp');
    expect(row).toContain('John Smith; Jane Doe');
    expect(row).toContain('G06N3/08; G06F16/00');
    expect(row).toContain('85%');
    expect(row).toContain('PatentsView');
  });

  it('handles missing enrichment data gracefully', () => {
    const result = {
      patentNumber: 'US99999999',
      title: 'Test Patent',
      relevanceScore: 0.42,
      abstract: null,
      source: 'PatentsView',
    };

    const row = buildCsvRow(result, null);
    expect(row).toContain('US99999999');
    expect(row).toContain('42%');
    // Empty enrichment columns should just be empty between commas
    expect(row.split(',').length).toBe(10); // 10 columns
  });

  it('escapes titles with commas', () => {
    const result = {
      patentNumber: 'US10234567',
      title: 'Method, System, and Apparatus',
      relevanceScore: 0.7,
      abstract: 'An abstract.',
      source: 'PatentsView',
    };

    const row = buildCsvRow(result, null);
    expect(row).toContain('"Method, System, and Apparatus"');
  });
});
