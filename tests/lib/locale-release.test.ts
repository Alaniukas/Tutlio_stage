import { afterEach, describe, expect, it } from 'vitest';
import {
  UI_RELEASED_LOCALES, BLOG_SCHEMA_LOCALES, SEO_LOCALES_BY_SURFACE,
  hasBlogSchema, hasLocalizedAssets, isSeoPublished, selectableLocales, seoLocalesForPath,
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

  it('keeps Italian UI release independent from search, blog schema and reviewed assets', () => {
    SEO_LOCALES_BY_SURFACE.marketing = [...originalMarketing, 'it'];
    expect(isSeoPublished('it', '/it/pricing')).toBe(true);
    expect(generateHreflangLinks('/pricing')).toContainEqual({ lang: 'it', href: 'https://www.tutlio.com/it/pricing' });
    for (const path of ['/schools/it/pricing', '/it/terms', '/it/privacy-policy', '/it/dpa', '/it/blog', '/it/tutor/example']) {
      expect(isSeoPublished('it', path), path).toBe(false);
      expect(generateHreflangLinks(path).some((link) => link.lang === 'it')).toBe(false);
    }
    expect(BLOG_SCHEMA_LOCALES).not.toContain('it');
    expect(hasBlogSchema('it')).toBe(false);
    expect(hasLocalizedAssets('it')).toBe(false);
    expect(selectableLocales()).toContain('it');
    expect(postSlug({ slug: 'base', slug_en: 'english', slug_it: 'unreleased' }, 'it')).toBe('english');
    const shell = (path: string) => renderShell({ locale: 'it', domain: 'com', path, title: 'Test', description: 'Test', body: '<h1>Test</h1>' });
    expect(shell('/pricing')).toContain('content="index, follow, max-image-preview:large"');
    expect(shell('/terms')).toContain('content="noindex, follow"');
  });

  it('refuses blog publication when database columns are unavailable', () => {
    SEO_LOCALES_BY_SURFACE.blog = [...originalBlog, 'pt-br'];
    expect(seoLocalesForPath('/pt-br/blog')).not.toContain('pt-br');
    expect(hasBlogSchema('pt-br')).toBe(false);
  });
});
