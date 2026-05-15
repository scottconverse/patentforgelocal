export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    if (line.startsWith('######')) {
      output.push(`<h6>${inlineFormat(line.slice(6).trim())}</h6>`);
      i++;
      continue;
    }
    if (line.startsWith('#####')) {
      output.push(`<h5>${inlineFormat(line.slice(5).trim())}</h5>`);
      i++;
      continue;
    }
    if (line.startsWith('####')) {
      output.push(`<h4>${inlineFormat(line.slice(4).trim())}</h4>`);
      i++;
      continue;
    }
    if (line.startsWith('###')) {
      output.push(`<h3>${inlineFormat(line.slice(3).trim())}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith('##')) {
      output.push(`<h2>${inlineFormat(line.slice(2).trim())}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith('#')) {
      output.push(`<h1>${inlineFormat(line.slice(1).trim())}</h1>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      output.push('<hr>');
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const content: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        content.push(inlineFormat(lines[i].slice(2)));
        i++;
      }
      output.push(`<blockquote>${content.join('<br>')}</blockquote>`);
      continue;
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      output.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\s*\|?[-:| ]+\|?\s*$/)) {
      const headerCells = parseTableRow(line);
      i += 2; // skip separator row
      output.push('<table>');
      output.push('<thead><tr>');
      headerCells.forEach((cell) => output.push(`<th>${inlineFormat(cell)}</th>`));
      output.push('</tr></thead>');
      output.push('<tbody>');
      while (i < lines.length && lines[i].includes('|')) {
        const cells = parseTableRow(lines[i]);
        output.push('<tr>');
        cells.forEach((cell) => output.push(`<td>${inlineFormat(cell)}</td>`));
        output.push('</tr>');
        i++;
      }
      output.push('</tbody></table>');
      continue;
    }

    // Unordered list
    if (line.match(/^(\s*[-*+] )/)) {
      output.push('<ul>');
      while (i < lines.length && lines[i].match(/^(\s*[-*+] )/)) {
        const content = lines[i].replace(/^\s*[-*+] /, '');
        output.push(`<li>${inlineFormat(content)}</li>`);
        i++;
      }
      output.push('</ul>');
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\. /)) {
      output.push('<ol>');
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        const content = lines[i].replace(/^\d+\. /, '');
        output.push(`<li>${inlineFormat(content)}</li>`);
        i++;
      }
      output.push('</ol>');
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      output.push('');
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !lines[i].match(/^(\s*[-*+] )/) &&
      !lines[i].match(/^\d+\. /) &&
      !lines[i].includes('|') &&
      !lines[i].match(/^(-{3,}|\*{3,}|_{3,})$/)
    ) {
      paraLines.push(inlineFormat(lines[i]));
      i++;
    }
    if (paraLines.length > 0) {
      output.push(`<p>${paraLines.join(' ')}</p>`);
    }
  }

  return output.join('\n');
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  // Escape HTML first
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inline code (before bold/italic to avoid conflicts)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return text;
}

export function markdownToStyledHtmlDoc(markdown: string, title: string): string {
  const body = markdownToHtml(markdown);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #030712;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 15px;
      line-height: 1.7;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 { font-size: 1.75rem; font-weight: 700; color: #60a5fa; border-bottom: 1px solid #374151; padding-bottom: 0.5rem; margin: 1.5rem 0 0.75rem; }
    h2 { font-size: 1.4rem; font-weight: 600; color: #93c5fd; border-bottom: 1px solid #1f2937; padding-bottom: 0.25rem; margin: 1.25rem 0 0.5rem; }
    h3 { font-size: 1.2rem; font-weight: 600; color: #c4b5fd; margin: 1rem 0 0.5rem; }
    h4 { font-size: 1rem; font-weight: 600; color: #e5e7eb; margin: 0.75rem 0 0.25rem; }
    p { color: #d1d5db; margin: 0.5rem 0; }
    ul { list-style: disc; margin: 0.5rem 0 0.5rem 1.5rem; color: #d1d5db; }
    ol { list-style: decimal; margin: 0.5rem 0 0.5rem 1.5rem; color: #d1d5db; }
    li { margin-bottom: 0.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin: 1rem 0; }
    th { background: #1f2937; color: #93c5fd; font-weight: 600; padding: 0.5rem 0.75rem; text-align: left; border: 1px solid #374151; }
    td { padding: 0.5rem 0.75rem; border: 1px solid #1f2937; color: #d1d5db; }
    tr:nth-child(even) td { background: #111827; }
    code { background: #1f2937; color: #93c5fd; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.85em; font-family: 'Courier New', monospace; }
    pre { background: #1f2937; border-radius: 6px; padding: 1rem; overflow-x: auto; margin: 0.75rem 0; }
    pre code { background: transparent; padding: 0; color: #d1d5db; }
    hr { border: none; border-top: 1px solid #374151; margin: 1.25rem 0; }
    strong { color: #f9fafb; font-weight: 600; }
    em { color: #9ca3af; font-style: italic; }
    blockquote { border-left: 4px solid #3b82f6; padding: 0.5rem 1rem; background: rgba(31,41,55,0.5); margin: 0.75rem 0; color: #9ca3af; font-style: italic; }
    a { color: #60a5fa; text-decoration: underline; }
    a:hover { color: #93c5fd; }
  </style>
</head>
<body>
${body}
<hr style="margin-top: 3rem;">
<p style="font-size: 0.8rem; color: #6b7280; line-height: 1.5; margin-top: 1rem;">
  <strong style="color: #9ca3af;">Disclaimer:</strong> This report was generated by PatentForge, an open-source AI-powered patent landscape research tool. It is intended for informational and educational purposes only. This report does not constitute legal advice. No attorney-client relationship is created by this report. The author of this tool is not a lawyer. The AI system that generated this analysis is not a lawyer. Patent law is complex and fact-specific, and AI-generated analysis may contain errors, omissions, or hallucinated references — including fabricated patent numbers, inaccurate legal citations, and incorrect statutory interpretations presented with high confidence. Before making any filing, licensing, enforcement, or investment decisions based on this report, consult a registered patent attorney.
</p>
</body>
</html>`;
}
