import { describe, expect, it } from 'vitest';
import { extractBlogToc, injectHeadingIds } from '../../src/lib/blogToc';

describe('blogToc', () => {
  it('extracts h2 and h3 headings', () => {
    const md = '# Title\n\n## First\n\n### Sub\n\n## Second';
    const toc = extractBlogToc(md);
    expect(toc).toHaveLength(3);
    expect(toc[0].text).toBe('First');
    expect(toc[1].level).toBe(3);
  });

  it('injects ids into rendered headings', () => {
    const toc = [{ id: 'first', text: 'First', level: 2 as const }];
    const html = injectHeadingIds('<h2>First</h2><p>x</p>', toc);
    expect(html).toContain('id="first"');
  });
});
