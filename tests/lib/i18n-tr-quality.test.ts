import { beforeAll, describe, expect, it } from 'vitest';
import { format, parse, formatDistanceStrict } from 'date-fns';
import { readFileSync } from 'node:fs';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { lt } from '../../src/lib/i18n/lt';
import { tr, trOverrides } from '../../src/lib/i18n/tr';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale, buildLocalizedPath, getLocaleFromPathname } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, SUPPORTED_LOCALES, LOCALE_FORMAT_TAGS, LOCALE_NAMES, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay, publicPagePath } from '../../src/lib/publicPage';
import { supportGeneralFollowUp, supportLocaleName } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, validateLocalizedPhone, getLocalizedPhonePlaceholder } from '../../src/lib/utils';
import { resolvePlatformTranslation } from '../../src/lib/i18n/platformOverrides';
import { getCaseStudy, getTestimonials, SHOW_PLACEHOLDER_SOCIAL_PROOF } from '../../src/components/landing/v2/socialProof';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
// The existing non-LT validator accepts international numbers, not only +370.
const correctedPhones = new Set(['onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError', 'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat']);
// The English values are incomplete labels; these limits come from Lithuanian copy.
const restoredNumericSources = new Set(['cal.massCancelChars', 'cal.massCancelDesc', 'compTut.studentReminderHint']);
const localizedDecimals = new Set(['pricing.studentFeeNote', 'pricing.yearlyDesc', 'settings.monthlyPlan', 'subscribe.paidAnnually', 'subscribe.trialBullet3']);
// Truncated source copy: every additional argument is already supplied by its caller.
const restoredArguments: Record<string, string[]> = {
};
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => { await loadLocaleDict('tr'); });

describe('Turkish tutor and tutoring-business localization', () => {
  it('covers the complete intended surface and preserves deferred English fallback', () => {
    expect(Object.keys(trOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !tr[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) expect(tr[key]).toBe(en[key]);
    expect(Object.keys(trOverrides).filter((key) => key.startsWith('quiz.')).length).toBeGreaterThan(450);
  });

  it.each([
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|TRY)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s', (_label, pattern) => {
    expect(expectedKeys.filter((key) => JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(tr[key], pattern)))).toEqual([]);
  });

  it('keeps interpolation contracts and uses the restored values in context', () => {
    const pattern = /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g;
    expect(expectedKeys.filter((key) => JSON.stringify([...tokens(en[key], pattern), ...(restoredArguments[key] ?? [])].sort()) !== JSON.stringify(tokens(tr[key], pattern)))).toEqual([]);
    expect(t('tr', 'compStu.cancellationInfo', { hours: 24, percent: 50 })).toBe('İptal: 24 saat önce (%50 ücret)');
    expect(t('tr', 'invoice.emailNote', { days: 7 })).toContain('7 gün');
    expect(t('tr', 'cal.massCancelChars', { count: 4 })).toBe('4 karakter (en az 5)');
    expect(t('tr', 'em.payReminderTiming', { hours: 24, timing: t('tr', 'em.payReminderBefore') })).toBe('Dersten 24 saat önce');
    expect(t('tr', 'em.payReminderTiming', { hours: 2, timing: t('tr', 'em.payReminderAfter') })).toBe('Dersten 2 saat sonra');
    expect(t('tr', 'em.afterLessonBody', { tutor: 'Deniz', studentPart: t('tr', 'em.afterLessonStudentPart', { student: 'Ece' }) })).toBe('Öğretmen <strong>Deniz</strong> ile ders (öğrenci: Ece) tamamlandı.');
  });

  it('preserves numeric claims, limits and prices with documented source and formatting corrections', () => {
    const pattern = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter((key) => {
      if (correctedPhones.has(key)) return false;
      const source = restoredNumericSources.has(key) ? lt[key] : en[key];
      const target = localizedDecimals.has(key) ? tr[key].replace(/(\d),(?=\d)/g, '$1.') : tr[key];
      return JSON.stringify(tokens(source, pattern)) !== JSON.stringify(tokens(target, pattern));
    })).toEqual([]);
    for (const key of correctedPhones) expect(tr[key]).not.toContain('+370');
  });

  it('loads Turkish consistently in the browser, email, SSR and support', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('tr', 'quiz.audience.solo.title')).toBe('Bağımsız özel ders öğretmeni');
      expect(translate('tr', 'companyNav.students')).toBe('Öğrenciler');
      expect(translate('tr', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('İptal etmek için €25 iptal ücreti ödemeniz gerekir.');
    }
    expect(supportLocaleName('tr')).toBe('Turkish');
    expect(supportGeneralFollowUp('tr')).toBe('Başka nasıl yardımcı olabilirim?');
  });

  it('retains destructive warnings and payment restrictions', () => {
    expect(tr['studentSettings.confirmDeleteMsg']).toContain('geri alınamaz');
    expect(tr['stuSched.mustPayDesc']).toContain('rezervasyonu yapamaz');
    expect(tr['stuSched.monthlyBillingReserved']).toContain('Şimdi ödeme yapmanız gerekmiyor');
    expect(tr['compSet.payDesc']).toContain('öğretmen ücretinin çıkarılmasıyla');
    expect(tr['compSch.confirmNoAvailability']).toContain('Yine de ders oluşturulsun mu?');
    expect(tr['dash.invoice']).toBe('Fatura');
    expect(tr['invoice.invoiceTitle']).toBe('Fatura');
    expect(tr['settings.refreshSub']).toBe('Abonelik bilgilerini yenile');
    const html = tHtml('tr', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
  });

  it('formats and parses Turkish calendar dates and keeps Turkish platform copy', () => {
    const locale = getDateFnsLocale('tr');
    const date = new Date(2026, 7, 31, 14, 30);
    expect(locale?.code).toBe('tr');
    expect(format(date, 'EEEE, d MMMM yyyy', { locale })).toBe('Pazartesi, 31 Ağustos 2026');
    expect(format(date, 'p', { locale })).toBe('14:30');
    for (let month = 0; month < 12; month++) {
      const fixture = new Date(2026, month, 12);
      const text = format(fixture, 'd MMMM yyyy', { locale });
      expect(format(parse(text, 'd MMMM yyyy', date, { locale }), 'd MMMM yyyy', { locale })).toBe(text);
    }
    expect(formatDistanceStrict(new Date(2026, 7, 31, 12, 30), date, { locale, addSuffix: true })).toBe('2 saat önce');
    expect(resolvePlatformTranslation('tutors', 'tr', 'landing.heroTitle', tr['landing.heroTitle'])).toBe(tr['landing.heroTitle']);
  });

  it('supports Turkish international phone input without changing Lithuanian validation', () => {
    expect(formatLocalizedPhone('+90 532 123 45 67', 'tr')).toBe('+905321234567');
    expect(validateLocalizedPhone('+905321234567', 'tr')).toBe(true);
    expect(validateLocalizedPhone('05321234567', 'tr')).toBe(false);
    expect(getLocalizedPhonePlaceholder('tr')).toBe('+90 532 123 45 67');
    expect(validateLocalizedPhone('+905321234567', 'lt')).toBe(false);
    expect(validateLocalizedPhone('+37061234567', 'lt')).toBe(true);
  });

  it('localizes booking and routing without publishing the locale', () => {
    expect(LOCALE_NAMES.tr).toBe('Türkçe');
    expect(LOCALE_FORMAT_TAGS.tr).toBe('tr-TR');
    expect(htmlLanguageCode('tr')).toBe('tr');
    expect(localeDirection('tr')).toBe('ltr');
    expect(isTranslatedLocale('tr')).toBe(false);
    expect(getLocaleFromPathname('/tr/pricing')).toBe('tr');
    expect(buildLocalizedPath('/pricing', 'tr', 'tutlio.com')).toBe('/tr/pricing');
    expect(publicPagePath('demo-tutor', 'tr')).toBe('/tr/tutor/demo-tutor');
    expect(getSeoMeta('tr', 'landing').title).toContain('Özel ders');
    expect(Object.keys(CHROME.tr).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('tr').enquirySentTitle).toBe('Talep gönderildi');
    expect(formatShortDay('2026-08-22', 'tr')).toBe('22 Ağu');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(SHOW_PLACEHOLDER_SOCIAL_PROOF).toBe(false);
    const englishCase = getCaseStudy('en');
    const turkishCase = getCaseStudy('tr');
    expect(turkishCase.org).toBe(englishCase.org);
    expect(turkishCase.authorName).toBe(englishCase.authorName);
    expect(turkishCase.stats.map(({ value }) => value)).toEqual(englishCase.stats.map(({ value }) => value));
    expect(getTestimonials('tr').map(({ name, photo, rating }) => ({ name, photo, rating }))).toEqual(getTestimonials('en').map(({ name, photo, rating }) => ({ name, photo, rating })));
  });

  it('allows Turkish preferences in the local migration while retaining every registered locale', () => {
    const sql = readFileSync('supabase/migrations/20260831234513_add_turkish_locale.sql', 'utf8');
    const allowedLists = [...sql.matchAll(/preferred_locale IN \(([^)]+)\)/g)];
    expect(allowedLists).toHaveLength(2);
    for (const [, list] of allowedLists) {
      const allowed = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
      expect(allowed).toContain('tr');
      expect(SUPPORTED_LOCALES.filter((locale) => !allowed.includes(locale))).toEqual([]);
    }
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE FROM|DROP TABLE)\b/i);
  });
});
