import { afterEach, describe, expect, it } from 'vitest';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { buildLocalizedPath, getDateFnsLocale, getLocaleFromPathname, getStoredLocale, storeLocale, stripLocalePrefix } from '../../src/lib/i18n';
import { PENDING_TRANSLATION_LOCALES, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { isValidLocale as serverAcceptsLocale, t as serverTranslate } from '../../api/_lib/i18n';
import { buildCanonicalUrl, hreflangTags } from '../../api/_lib/seo-routing';
import { postSlug, resolveField } from '../../src/lib/blogLocale';

afterEach(() => localStorage.clear());

describe('translation-ready international locales', () => {
  it.each(PENDING_TRANSLATION_LOCALES)('%s loads its dictionary without needing the English UI locale first', async (locale) => {
    await loadLocaleDict(locale);
    // Pending means unpublished; a dictionary may already contain a translation draft.
    const expected = serverTranslate(locale, 'common.login');
    expect(expected).not.toBe('common.login');
    expect(t(locale, 'common.login')).toBe(expected);
    expect(serverAcceptsLocale(locale)).toBe(true);
    const html = tHtml(locale, 'stuSess.refundSuccessManualTutor', { tutor: '<script>' });
    expect(html).toContain('<strong>&lt;script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(getDateFnsLocale(locale)).toBeDefined();
  });

  it.each(PENDING_TRANSLATION_LOCALES)('%s survives browser preference and URL round trips', (locale) => {
    storeLocale(locale);
    expect(getStoredLocale()).toBe(locale);
    const url = buildLocalizedPath('/fr/company/login', locale, 'www.tutlio.com');
    expect(url).toBe(`/${locale}/company/login`);
    expect(getLocaleFromPathname(url)).toBe(locale);
    expect(stripLocalePrefix(url)).toBe('/company/login');
    expect(buildCanonicalUrl('/pricing', locale)).toBe(`https://www.tutlio.com/${locale}/pricing`);
    expect(hreflangTags('/pricing')).not.toContain(`hreflang="${htmlLanguageCode(locale)}"`);
  });

  it('keeps regional tags and Arabic direction distinct from URL slugs', () => {
    expect(htmlLanguageCode('pt-br')).toBe('pt-BR');
    expect(htmlLanguageCode('es-mx')).toBe('es-MX');
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
  });

  it('links untranslated blog locales using the same English slug as the server lookup', () => {
    const post = { slug: 'original-slug', slug_en: 'english-slug', title_en: 'English title', title_lt: 'Lietuviškas' };
    for (const locale of PENDING_TRANSLATION_LOCALES) {
      expect(postSlug(post, locale)).toBe('english-slug');
      expect(resolveField(post, 'title', locale)).toBe('English title');
    }
  });
});
