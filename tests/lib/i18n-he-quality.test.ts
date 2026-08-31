import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { he, heOverrides } from '../../src/lib/i18n/he';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { generateHreflangLinks } from '../../api/_lib/seo-routing';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(() => loadLocaleDict('he'));

describe('Hebrew tutor and business localization', () => {
  it('explicitly covers the agreed scope without changing the dictionary key contract', () => {
    expect(Object.keys(heOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !he[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) {
      expect(he[key], key).toBe(en[key]);
    }
  });

  it.each([
    ['parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s, with only the documented broken-source counter repaired', (_label, pattern) => {
    expect(expectedKeys.filter((key) => !['cal.massCancelChars', 'compStu.cancellationInfo'].includes(key) &&
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(he[key], pattern)),
    )).toEqual([]);
    // Calendar supplies count; cancellation validation and LT both require five characters.
    expect(t('he', 'cal.massCancelChars', { count: 3 })).toBe('3/5 תווים');
    expect(t('he', 'compStu.cancellationInfo', { hours: 24, percent: 50 })).toContain('24 שעות מראש (דמי ביטול של 50%)');
  });

  it('uses the same Hebrew in lazy browser, email and SSR dictionaries', () => {
    for (const translate of [t, emailText, ssrText]) {
      for (const key of ['common.login', 'companyNav.students', 'chat.title', 'quiz.hero.title']) {
        expect(translate('he', key)).toBe(he[key]);
      }
    }
    expect(t('he', 'nav.forTutors', undefined, 'schools')).toBe(he['nav.forTutors']);
    expect(t('he', 'nav.forSchools', undefined, 'teachers')).toBe(he['nav.forSchools']);
    expect(supportGeneralFollowUp('he')).toBe('במה עוד אפשר לעזור?');
  });

  it('escapes user data and distinguishes fees, credits, cancellation and deletion', () => {
    const html = tHtml('he', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('he', 'stuSess.penaltyPayNote', { amount: 25 })).toContain('€25');
    expect(he['cal.cancel']).toBe('ביטול');
    expect(he['common.delete']).toBe('מחיקה');
    expect(he['invoices.statusPaid']).toBe('שולמה');
    expect(he['studentSettings.confirmDeleteMsg']).toContain('לא ניתן לבטל');
    expect(he['compSet.payDesc']).toContain('מחיר השיעור − שכר המורה');
    expect(he['stuSched.mustPayDesc']).toContain('אי אפשר להזמין');
    expect(he['compSch.confirmNoAvailability']).toContain('בכל זאת?');
    expect(he['dash.invoice']).toBe('חשבונית');
    expect(he['invoice.invoiceTitle']).toBe('חשבונית');
    expect(he['em.payReminderBodyOther']).toContain('לא שילם עבור השיעור.');
  });

  it('uses Hebrew, Gregorian dates and Sunday-first weeks while keeping publication gated', () => {
    expect(localeDirection('he')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
    expect(htmlLanguageCode('he')).toBe('he');
    expect(new Intl.DateTimeFormat(LOCALE_FORMAT_TAGS.he).resolvedOptions().calendar).toBe('gregory');
    expect(getDateFnsLocale('he')?.code).toBe('he');
    expect(getDateFnsLocale('he')?.options?.weekStartsOn).toBe(0);
    expect(formatShortDay('2026-08-22', 'he')).toContain('אוג');
    expect(getSeoMeta('he', 'landing').title).toMatch(/[\u0590-\u05ff]/);
    expect(getSeoMeta('he', 'pricing').title).toMatch(/[\u0590-\u05ff]/);
    expect(isTranslatedLocale('he')).toBe(false);
    expect(generateHreflangLinks('/').some((link) => link.lang === 'he')).toBe(false);
  });

  it('localizes the entire booking interface while retaining other locale objects', () => {
    expect(Object.keys(CHROME.he).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('he').enquirySentTitle).toBe('הפנייה נשלחה');
    expect(chromeFor('he').book).toBe('הזמנת שיעור');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('ar')).toBe(CHROME.ar);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.he[key], key).not.toBe('');
      expect(tokens(CHROME.he[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('uses an Israeli phone example without restricting Hebrew users to Israel', () => {
    expect(getLocalizedPhonePlaceholder('he')).toBe('+972 50 123 4567');
    expect(formatLocalizedPhone('+972 50 123 4567', 'he')).toBe('+972501234567');
    expect(validateLocalizedPhone('+972 50 123 4567', 'he')).toBe(true);
    expect(validateLocalizedPhone('+44 7700 900 123', 'he')).toBe(true);
    expect(validateLocalizedPhone('0501234567', 'he')).toBe(false);
  });
});
