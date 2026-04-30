/**
 * Lightweight markdown → HTML converter for blog posts.
 * Supports: headings, bold, italic, links, images, unordered/ordered lists,
 * code blocks, inline code, blockquotes, horizontal rules, and paragraphs.
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = '';
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      html += `<pre class="blog-code"><code>${codeLines.join('\n')}</code></pre>\n`;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      html += '<hr />\n';
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html += `<h${level}>${inline(headingMatch[2])}</h${level}>\n`;
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html += `<blockquote>${quoteLines.map(l => `<p>${inline(l)}</p>`).join('\n')}</blockquote>\n`;
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      html += '<ul>\n';
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^[-*+]\s/, ''))}</li>\n`;
        i++;
      }
      html += '</ul>\n';
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      html += '<ol>\n';
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>\n`;
        i++;
      }
      html += '</ol>\n';
      continue;
    }

    // Paragraph — collect consecutive non-empty lines
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('>') && !lines[i].startsWith('```') && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      html += `<p>${inline(paraLines.join(' '))}</p>\n`;
    }
  }

  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text: string): string {
  let result = text;
  // Images before links so ![alt](url) doesn't get captured by link regex
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="blog-img" loading="lazy" />');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  return result;
}
