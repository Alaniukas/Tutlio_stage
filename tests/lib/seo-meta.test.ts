import { describe, expect, it } from 'vitest';
import { TRANSLATED_LOCALES } from '../../src/lib/i18n/locales';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { mdToHtml } from '../../api/blog-render';

describe('localized SEO metadata', () => {
  it('has distinct, search-focused landing and pricing copy for every locale', () => {
    const landingTitles = new Set<string>();

    for (const locale of TRANSLATED_LOCALES) {
      const landing = getSeoMeta(locale, 'landing');
      const pricing = getSeoMeta(locale, 'pricing');

      expect(landing.title).toContain('Tutlio');
      expect(pricing.title).toContain('Tutlio');
      expect(landing.title.length).toBeGreaterThanOrEqual(40);
      expect(landing.title.length).toBeLessThanOrEqual(65);
      expect(pricing.title.length).toBeGreaterThanOrEqual(35);
      expect(pricing.title.length).toBeLessThanOrEqual(75);
      expect(landing.description.length).toBeGreaterThanOrEqual(90);
      expect(landing.description.length).toBeLessThanOrEqual(180);
      expect(pricing.description.length).toBeGreaterThanOrEqual(90);
      expect(pricing.description.length).toBeLessThanOrEqual(180);
      expect(pricing.title).not.toBe(landing.title);
      landingTitles.add(landing.title);
    }

    expect(landingTitles.size).toBe(TRANSLATED_LOCALES.length);
  });
});

describe('blog crawler HTML', () => {
  it('normalizes Markdown H1 headings because the article shell owns the page H1', () => {
    const html = mdToHtml('# Imported title\n\n## Section');
    expect(html).not.toContain('<h1>');
    expect(html).toContain('<h2>Imported title</h2>');
    expect(html).toContain('<h2>Section</h2>');
  });
});
