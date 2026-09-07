import { describe, expect, it } from 'vitest';
import { extractBlogFaqs, blogFaqJsonLd } from '../../api/_lib/blogFaq.js';
import { isBlogAutoPublishWeekday } from '../../api/_lib/blogMarkets.js';
import { missingBlogLocales } from '../../api/_lib/blogAutoGenerate.js';

describe('extractBlogFaqs', () => {
  it('reads question headings after a FAQ section', () => {
    const md = `## Intro\n\nHello.\n\n## FAQ\n\n### When should we start tutoring?\nAfter a term of slipping grades, not after one bad test.\n\n### Does online tutoring work?\nIt works when the slot is regular and a parent is nearby for younger children.\n`;
    const faqs = extractBlogFaqs(md);
    expect(faqs).toHaveLength(2);
    expect(faqs[0].question).toMatch(/tutoring/i);
    expect(faqs[0].answer).toMatch(/slipping grades/i);
    const json = blogFaqJsonLd(faqs);
    expect(json?.['@type']).toBe('FAQPage');
    expect(json?.mainEntity).toHaveLength(2);
  });

  it('understands DUK headings', () => {
    const md = `## DUK\n\n### Kada kreiptis?\nKai namų darbai virsta konfliktu kas vakarą.\n`;
    expect(extractBlogFaqs(md)[0].question).toMatch(/kreiptis/i);
  });
});

describe('isBlogAutoPublishWeekday', () => {
  it('publishes new posts on Tuesday and Friday UTC only', () => {
    expect(isBlogAutoPublishWeekday(new Date('2026-09-01T05:00:00Z'))).toBe(true); // Tue
    expect(isBlogAutoPublishWeekday(new Date('2026-09-04T05:00:00Z'))).toBe(true); // Fri
    expect(isBlogAutoPublishWeekday(new Date('2026-09-02T05:00:00Z'))).toBe(false); // Wed
  });
});

describe('missingBlogLocales', () => {
  it('lists every empty locale on a new draft', () => {
    const missing = missingBlogLocales({});
    expect(missing).toHaveLength(13);
    expect(missing[0]).toBe('en');
  });

  it('skips locales that already have title and body', () => {
    const post = { title_en: 'A', content_en: 'Body long enough', title_lt: 'B', content_lt: 'Tekstas' };
    const missing = missingBlogLocales(post);
    expect(missing).not.toContain('en');
    expect(missing).not.toContain('lt');
    expect(missing).toContain('de');
  });
});
