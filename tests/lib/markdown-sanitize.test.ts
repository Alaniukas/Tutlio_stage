import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '../../src/lib/markdown';

describe('markdownToHtml — XSS hardening', () => {
  it('neutralizes raw HTML in paragraphs', () => {
    const out = markdownToHtml('Hello <script>alert(1)</script> world');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('neutralizes raw HTML in headings and list items', () => {
    const out = markdownToHtml('# Title <img src=x onerror=alert(1)>\n\n- item <b onmouseover=x>bold</b>');
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('<b onmouseover');
    expect(out).toContain('<h1>');
    expect(out).toContain('<li>');
  });

  it('neutralizes raw HTML in blockquotes', () => {
    const out = markdownToHtml('> quoted <iframe src=evil></iframe>');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<blockquote>');
  });

  it('blocks javascript: URLs in links', () => {
    const out = markdownToHtml('[click me](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="#"');
  });

  it('blocks data: URLs in images', () => {
    const out = markdownToHtml('![x](data:text/html,<script>alert(1)</script>)');
    expect(out).not.toContain('src="data:');
  });

  it('keeps https links and images working', () => {
    const out = markdownToHtml('[site](https://tutlio.lt) ![pic](https://tutlio.lt/img.png)');
    expect(out).toContain('href="https://tutlio.lt"');
    expect(out).toContain('src="https://tutlio.lt/img.png"');
  });

  it('keeps root-relative and mailto links working', () => {
    const out = markdownToHtml('[a](/pricing) [b](mailto:info@tutlio.lt)');
    expect(out).toContain('href="/pricing"');
    expect(out).toContain('href="mailto:info@tutlio.lt"');
  });

  it('still renders markdown formatting', () => {
    const out = markdownToHtml('**bold** *italic* `code`');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<code>code</code>');
  });

  it('still escapes fenced code blocks', () => {
    const out = markdownToHtml('```\n<script>alert(1)</script>\n```');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('prevents attribute breakout via quotes in URLs', () => {
    const out = markdownToHtml('[x](https://e.com/" onmouseover="alert(1))');
    expect(out).not.toContain('onmouseover="alert');
  });
});
