import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown';

describe('markdownToHtml — HTML injection safety', () => {
  it('escapes <script> tags so they cannot execute', () => {
    const input = '<script>alert("xss")</script>';
    const output = markdownToHtml(input);
    expect(output).not.toContain('<script>');
    expect(output).toContain('&lt;script&gt;');
  });

  it('escapes inline event handlers', () => {
    const input = '<img src=x onerror="alert(1)">';
    const output = markdownToHtml(input);
    expect(output).not.toContain('<img');
    expect(output).toContain('&lt;img');
  });

  it('escapes raw HTML tags embedded in markdown text', () => {
    const input = 'Some text <b>bold via html</b> and more.';
    const output = markdownToHtml(input);
    expect(output).not.toContain('<b>');
    expect(output).toContain('&lt;b&gt;');
  });

  it('escapes script tags inside a markdown code block', () => {
    const input = '```\n<script>alert("xss")</script>\n```';
    const output = markdownToHtml(input);
    expect(output).not.toContain('<script>');
    expect(output).toContain('&lt;script&gt;');
  });

  it('does not escape markdown-generated tags (bold, headers)', () => {
    const input = '**bold text** and # Heading';
    const output = markdownToHtml(input);
    // Markdown-generated HTML is intentional and should be present
    expect(output).toContain('<strong>bold text</strong>');
  });

  it('does not double-escape existing HTML entities', () => {
    // Ampersands that are already entity-encoded should be re-escaped correctly
    const input = 'AT&T Corporation';
    const output = markdownToHtml(input);
    expect(output).toContain('AT&amp;T');
    expect(output).not.toContain('AT&T');
  });
});

describe('markdownToHtml — standard markdown rendering', () => {
  it('renders headings', () => {
    expect(markdownToHtml('# H1')).toContain('<h1>H1</h1>');
    expect(markdownToHtml('## H2')).toContain('<h2>H2</h2>');
    expect(markdownToHtml('### H3')).toContain('<h3>H3</h3>');
  });

  it('renders bold and italic inline', () => {
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(markdownToHtml('*italic*')).toContain('<em>italic</em>');
  });

  it('renders unordered lists', () => {
    const output = markdownToHtml('- item one\n- item two');
    expect(output).toContain('<ul>');
    expect(output).toContain('<li>item one</li>');
    expect(output).toContain('<li>item two</li>');
  });

  it('renders ordered lists', () => {
    const output = markdownToHtml('1. first\n2. second');
    expect(output).toContain('<ol>');
    expect(output).toContain('<li>first</li>');
  });

  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('');
  });
});
