import { describe, expect, it } from 'vitest';
import { extractBlogFaqs, blogFaqJsonLd } from '../../api/_lib/blogFaq.js';
import { BLOG_LOCALE_WRITE_ORDER, isBlogAutoPublishWeekday } from '../../api/_lib/blogMarkets.js';
import { missingBlogLocales } from '../../api/_lib/blogAutoGenerate.js';
import { BLOG_SCHEMA_LOCALES, blogLocaleColumn } from '../../src/lib/i18n/localeRelease.js';
import { BLOG_FAQ_LABEL, BLOG_LOCALE_LANGUAGE, BLOG_MARKET_NOTES } from '../../api/_lib/blogMarkets.js';

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
    expect(missing).toHaveLength(36);
    expect(missing[0]).toBe('en');
  });

  it('skips only locales that have a complete title, excerpt, body and slug', () => {
    const post = {
      title_en: 'A', excerpt_en: 'Excerpt', content_en: 'Body long enough', slug_en: 'a',
      title_lt: 'B', excerpt_lt: 'Ištrauka', content_lt: 'Tekstas', slug_lt: 'b',
    };
    const missing = missingBlogLocales(post);
    expect(missing).not.toContain('en');
    expect(missing).not.toContain('lt');
    expect(missing).toContain('de');
  });

  it('has native generation guidance and FAQ labels for every blog locale', () => {
    for (const locale of BLOG_SCHEMA_LOCALES) {
      expect(BLOG_LOCALE_LANGUAGE[locale]).toBeTruthy();
      expect(BLOG_MARKET_NOTES[locale].length).toBeGreaterThan(40);
      expect(BLOG_FAQ_LABEL[locale]).toBeTruthy();
      expect(blogLocaleColumn('title', locale)).not.toContain('-');
    }
    expect(BLOG_LOCALE_WRITE_ORDER).toHaveLength(BLOG_SCHEMA_LOCALES.length);
    expect(new Set(BLOG_LOCALE_WRITE_ORDER)).toEqual(new Set(BLOG_SCHEMA_LOCALES));
  });
});
