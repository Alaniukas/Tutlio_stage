import { describe, expect, it } from 'vitest';
import { markdownToEmailHtml } from '../../api/_lib/blogMarkdownEmail.js';

describe('markdownToEmailHtml', () => {
  it('renders headings, lists and bold', () => {
    const html = markdownToEmailHtml('# Title\n\n## Section\n\n- **Bold** item\n\nParagraph.');
    expect(html).toContain('<h2');
    expect(html).toContain('<h3');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<li');
    expect(html).toContain('<p');
  });

  it('escapes HTML in source markdown', () => {
    const html = markdownToEmailHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
