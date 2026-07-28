import { describe, expect, it } from 'vitest';
import { enrichBlogLocaleContent } from '../../api/_lib/blogRelatedLinks.js';

describe('enrichBlogLocaleContent', () => {
  it('appends about block and related links', () => {
    const out = enrichBlogLocaleContent('# Hello\n\nBody text.', 'lt', [
      { id: '1', slug: 'test-post', title: 'Test', tag: 'SEO', url: 'https://www.tutlio.lt/blog/test-post' },
    ]);
    expect(out).toContain('## Apie Tutlio');
    expect(out).toContain('## Skaitykite taip pat');
    expect(out).toContain('/blog/test-post');
  });

  it('is idempotent', () => {
    const once = enrichBlogLocaleContent('content', 'en', []);
    const twice = enrichBlogLocaleContent(once, 'en', []);
    expect(twice.match(/## About Tutlio/g)?.length).toBe(1);
  });
});
