import { afterEach, describe, expect, it } from 'vitest';
import {
  UI_RELEASED_LOCALES, BLOG_SCHEMA_LOCALES, SEO_LOCALES_BY_SURFACE,
  blogLocaleColumn, hasBlogSchema, hasCompleteBlogLocale, hasLocalizedAssets, isSeoPublished, selectableLocales, seoLocalesForPath,
} from '../../src/lib/i18n/localeRelease';
import { generateHreflangLinks } from '../../api/_lib/seo-routing';
import { postSlug } from '../../src/lib/blogLocale';
import { renderShell } from '../../api/_lib/ssr-shell';
import { LOCALE_NAMES, SUPPORTED_LOCALES } from '../../src/lib/i18n/locales';
import { localeAvailabilityParams } from '../../src/lib/i18n/localeAvailability';
import { loadLocaleDict, t } from '../../src/lib/i18n/core';

const originalMarketing = SEO_LOCALES_BY_SURFACE.marketing;
const originalBlog = SEO_LOCALES_BY_SURFACE.blog;
afterEach(() => {
  SEO_LOCALES_BY_SURFACE.marketing = originalMarketing;
  SEO_LOCALES_BY_SURFACE.blog = originalBlog;
});

describe('independent locale releases', () => {
  it('exposes every registered locale in production without duplicates', () => {
    expect(selectableLocales()).toEqual(UI_RELEASED_LOCALES);
    expect(selectableLocales()).toEqual(SUPPORTED_LOCALES);
    expect(selectableLocales()).toContain('it');
    expect(selectableLocales()).toContain('cs');
    expect(selectableLocales(true)).toEqual(SUPPORTED_LOCALES);
    expect(new Set(selectableLocales(true)).size).toBe(selectableLocales(true).length);
  });

  it('derives the public language count and FAQ list from the released selector', async () => {
    const params = localeAvailabilityParams('en');
    expect(params.count).toBe(SUPPORTED_LOCALES.length);
    for (const locale of SUPPORTED_LOCALES) expect(params.languages).toContain(LOCALE_NAMES[locale]);
    await loadLocaleDict('en');
    const answer = t('en', 'landing.faq.languagesA', params);
    expect(answer).toContain(`${SUPPORTED_LOCALES.length} languages`);
    expect(answer).not.toMatch(/\{(?:count|languages)\}/);
  });

  it.each(SUPPORTED_LOCALES)('%s renders the released count and complete language list', async (locale) => {
    await loadLocaleDict(locale);
    const params = localeAvailabilityParams(locale);
    const answer = t(locale, 'landing.faq.languagesA', params);
    expect(params.count).toBe(36);
    expect(answer).toContain('36');
    expect(answer).not.toMatch(/\{(?:count|languages)\}/);
    for (const releasedLocale of UI_RELEASED_LOCALES) {
      expect(answer).toContain(LOCALE_NAMES[releasedLocale]);
    }
  });

  it('publishes Italian marketing and blog pages while legal stays on the legacy set', () => {
    expect(isSeoPublished('it', '/it/pricing')).toBe(true);
    expect(generateHreflangLinks('/pricing')).toContainEqual({ lang: 'it', href: 'https://www.tutlio.com/it/pricing' });
    for (const path of ['/schools/it/pricing', '/it/tutor/example', '/it/features/calendar']) {
      expect(isSeoPublished('it', path), path).toBe(true);
    }
    expect(isSeoPublished('it', '/it/blog')).toBe(true);
    expect(generateHreflangLinks('/it/blog').some((link) => link.lang === 'it')).toBe(true);
    for (const path of ['/it/terms', '/it/privacy-policy', '/it/dpa']) {
      expect(isSeoPublished('it', path), path).toBe(false);
      expect(generateHreflangLinks(path).some((link) => link.lang === 'it')).toBe(false);
    }
    expect(BLOG_SCHEMA_LOCALES).toContain('it');
    expect(hasBlogSchema('it')).toBe(true);
    expect(hasLocalizedAssets('it')).toBe(false);
    expect(selectableLocales()).toContain('it');
    expect(postSlug({ slug: 'base', slug_en: 'english', slug_it: 'italiano' }, 'it')).toBe('italiano');
    const shell = (path: string) => renderShell({ locale: 'it', domain: 'com', path, title: 'Test', description: 'Test', body: '<h1>Test</h1>' });
    expect(shell('/pricing')).toContain('content="index, follow, max-image-preview:large"');
    expect(shell('/terms')).toContain('content="noindex, follow"');
  });

  it('publishes competitor comparisons only in the three domain languages', () => {
    expect([...seoLocalesForPath('/compare')]).toEqual(['en', 'lt', 'pl']);
    expect([...seoLocalesForPath('/lt/compare/tutorbird')]).toEqual(['en', 'lt', 'pl']);
    expect(isSeoPublished('en', '/compare/tutorbird')).toBe(true);
    expect(isSeoPublished('pl', '/compare')).toBe(true);
    expect(isSeoPublished('de', '/de/compare/tutorbird')).toBe(false);
    const langs = generateHreflangLinks('/compare/tutorbird').map((l) => l.lang).sort();
    expect(langs).toEqual(['en', 'lt', 'pl', 'x-default']);
    // The solo landing is ordinary marketing copy and keeps the full cluster.
    expect(seoLocalesForPath('/for-tutors')).toEqual(SEO_LOCALES_BY_SURFACE.marketing);
  });

  it('publishes blogs for all released locales using safe regional column names', () => {
    expect(seoLocalesForPath('/blog')).toEqual(BLOG_SCHEMA_LOCALES);
    expect(BLOG_SCHEMA_LOCALES).toEqual(SUPPORTED_LOCALES);
    expect(hasBlogSchema('pt-br')).toBe(true);
    expect(blogLocaleColumn('title', 'pt-br')).toBe('title_pt_br');
    expect(blogLocaleColumn('slug', 'es-mx')).toBe('slug_es_mx');
    expect(blogLocaleColumn('content', 'zh-hk')).toBe('content_zh_hk');
  });

  it('requires every native article field before exposing a locale', () => {
    const complete = {
      title_he: 'כותרת שימושית',
      excerpt_he: 'תקציר שמסביר מה הקורא ילמד מהמאמר.',
      content_he: '## מבוא\n\nתוכן מקומי מלא.',
      slug_he: 'useful-title',
    };
    expect(hasCompleteBlogLocale(complete, 'he')).toBe(true);
    expect(hasCompleteBlogLocale({ ...complete, content_he: '' }, 'he')).toBe(false);
  });
});
