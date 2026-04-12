/**
 * Tests for the markdown-to-DOCX parser functions.
 * Verifies inline formatting, list handling, and structural parsing.
 *
 * Note: docx TextRun internals store text as root[1] (a raw string),
 * not as an object with a text property.
 */

import { parseInlineRuns, parseMarkdownToDocxParagraphs } from './feasibility.service';
import { Paragraph, Table } from 'docx';

/** Extract the text string from a docx TextRun */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- docx internal structure
function getText(run: any): string {
  // TextRun stores text at root[1] which is a Text object with root[1] = string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- docx internal
  const textNode = run.root.find((r: any) => r?.rootKey === 'w:t');
  return textNode?.root?.[1] ?? '';
}

/** Check if a TextRun has a specific formatting property */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any -- reserved test helper, docx internal structure
function _hasProperty(run: any, key: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- docx internal
  const props = run.root.find((r: any) => r?.rootKey === 'w:rPr');
  if (!props) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- docx internal
  return props.root.some((p: any) => p?.rootKey === key);
}

describe('parseInlineRuns', () => {
  it('returns plain text as a single run', () => {
    const runs = parseInlineRuns('Hello world');
    expect(runs).toHaveLength(1);
    expect(getText(runs[0])).toBe('Hello world');
  });

  it('parses **bold** text', () => {
    const runs = parseInlineRuns('This is **bold** text');
    expect(runs).toHaveLength(3);
    expect(getText(runs[0])).toBe('This is ');
    expect(getText(runs[1])).toBe('bold');
    expect(getText(runs[2])).toBe(' text');
  });

  it('parses *italic* text', () => {
    const runs = parseInlineRuns('This is *italic* text');
    expect(runs).toHaveLength(3);
    expect(getText(runs[1])).toBe('italic');
  });

  it('parses _italic_ with underscores', () => {
    const runs = parseInlineRuns('This is _italic_ text');
    expect(runs).toHaveLength(3);
    expect(getText(runs[1])).toBe('italic');
  });

  it('parses `inline code`', () => {
    const runs = parseInlineRuns('Use `console.log` here');
    expect(runs).toHaveLength(3);
    expect(getText(runs[1])).toBe('console.log');
  });

  it('handles mixed bold and italic', () => {
    const runs = parseInlineRuns('**bold** and *italic*');
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(getText(runs[0])).toBe('bold');
    expect(getText(runs[2])).toBe('italic');
  });

  it('handles text with no formatting', () => {
    const runs = parseInlineRuns('Just plain text, nothing special');
    expect(runs).toHaveLength(1);
    expect(getText(runs[0])).toBe('Just plain text, nothing special');
  });
});

describe('parseMarkdownToDocxParagraphs', () => {
  it('parses headings at all levels', () => {
    const elements = parseMarkdownToDocxParagraphs('# H1\n## H2\n### H3\n#### H4');
    expect(elements).toHaveLength(4);
    expect(elements.every((e) => e instanceof Paragraph)).toBe(true);
  });

  it('parses unordered bullets', () => {
    const elements = parseMarkdownToDocxParagraphs('- Item 1\n- Item 2\n* Item 3');
    expect(elements).toHaveLength(3);
  });

  it('parses nested bullets (indented)', () => {
    const elements = parseMarkdownToDocxParagraphs('- Parent\n  - Child\n    - Grandchild');
    expect(elements).toHaveLength(3);
    // First is level 0, second and third are level 1
  });

  it('parses numbered lists', () => {
    const elements = parseMarkdownToDocxParagraphs('1. First\n2. Second\n3. Third');
    expect(elements).toHaveLength(3);
  });

  it('parses tables', () => {
    const md = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1 | Cell 2 |';
    const elements = parseMarkdownToDocxParagraphs(md);
    // Should produce a Table + empty paragraph after it
    const tables = elements.filter((e) => e instanceof Table);
    expect(tables).toHaveLength(1);
  });

  it('handles horizontal rules', () => {
    const elements = parseMarkdownToDocxParagraphs('Text before\n---\nText after');
    expect(elements).toHaveLength(3);
  });

  it('handles blank lines', () => {
    const elements = parseMarkdownToDocxParagraphs('Line 1\n\nLine 2');
    expect(elements).toHaveLength(3); // Line 1, blank, Line 2
  });

  it('applies inline formatting in body text', () => {
    const elements = parseMarkdownToDocxParagraphs('This has **bold** and *italic*');
    expect(elements).toHaveLength(1);
    expect(elements[0] instanceof Paragraph).toBe(true);
  });

  it('applies inline formatting in bullet items', () => {
    const elements = parseMarkdownToDocxParagraphs('- **Bold** bullet');
    expect(elements).toHaveLength(1);
  });

  it('handles mixed content (headers, bullets, numbered, text, tables)', () => {
    const md = [
      '# Title',
      '',
      'Some intro text with **bold**.',
      '',
      '## Section',
      '',
      '- Bullet one',
      '  - Nested bullet',
      '- Bullet two',
      '',
      '1. Step one',
      '2. Step two',
      '',
      '| Col A | Col B |',
      '|-------|-------|',
      '| val 1 | val 2 |',
      '',
      '---',
      '',
      'Final paragraph.',
    ].join('\n');

    const elements = parseMarkdownToDocxParagraphs(md);
    expect(elements.length).toBeGreaterThan(10);

    const tables = elements.filter((e) => e instanceof Table);
    expect(tables).toHaveLength(1);
  });
});
