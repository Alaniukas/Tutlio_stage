import { beforeAll, describe, expect, it } from 'vitest';
import { format, parse, formatDistanceStrict, formatRelative } from 'date-fns';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { fil, filOverrides } from '../../src/lib/i18n/fil';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, validateLocalizedPhone, getLocalizedPhonePlaceholder } from '../../src/lib/utils';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
// Existing non-LT validation already accepts international numbers. These six
// source messages incorrectly require +370; the Filipino copy reflects reality.
const correctedPhoneKeys = new Set(['onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError', 'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat']);
// Repair abbreviated source messages using arguments their callers already pass.
// All source arguments still have to be present; only these additions are allowed.
const restoredArguments: Record<string, string[]> = {
};
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => { await loadLocaleDict('fil'); });

describe('Filipino tutor and business localization', () => {
  it('explicitly covers all in-scope keys and leaves other product dictionaries unchanged', () => {
    expect(Object.keys(filOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(fil).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !fil[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) expect(fil[key]).toBe(en[key]);
  });

  it.each([
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|PHP)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s throughout the dictionary', (_label, pattern) => {
    expect(expectedKeys.filter((key) => JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(fil[key], pattern)))).toEqual([]);
  });

  it('preserves interpolation parameters and restores only documented caller arguments', () => {
    const pattern = /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g;
    expect(expectedKeys.filter((key) => JSON.stringify([...tokens(en[key], pattern), ...(restoredArguments[key] ?? [])].sort()) !== JSON.stringify(tokens(fil[key], pattern)))).toEqual([]);
    expect(t('fil', 'studentWait.addedOn', { date: '31 Ago' })).toBe('Idinagdag noong 31 Ago');
    expect(t('fil', 'companyWait.inQueueSince', { date: '2026-08-31 14:30' })).toContain('2026-08-31 14:30');
    expect(t('fil', 'invoice.emailNote', { days: 7 })).toContain('7 araw');
    expect(t('fil', 'cal.massCancelChars', { count: 4 })).toBe('4 character (hindi bababa sa 5)');
    expect(t('fil', 'compSch.seriesSummaryHtml', { fromDate: '2026-09-01', weekday: 'Martes', timeRange: '14:30–15:30' })).toBe('Mula 2026-09-01, ang mga susunod na sesyon sa seryeng ito ay sa Martes, 14:30–15:30.');
    expect(t('fil', 'em.payReminderTiming', { hours: 24, timing: t('fil', 'em.payReminderBefore') })).toBe('24 oras bago ang sesyon');
    expect(t('fil', 'em.payReminderTiming', { hours: 2, timing: t('fil', 'em.payReminderAfter') })).toBe('2 oras pagkatapos ng sesyon');
  });

  it('preserves numeric claims, limits and prices except the documented phone corrections', () => {
    const pattern = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter((key) => !correctedPhoneKeys.has(key) && JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(fil[key], pattern)))).toEqual([]);
    for (const key of correctedPhoneKeys) {
      expect(fil[key]).toContain('+63 917 123 4567');
      expect(fil[key]).not.toContain('+370');
    }
  });

  it('loads consistent Filipino UI, email, SSR and support copy', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('fil', 'common.login')).toBe('Mag-log in');
      expect(translate('fil', 'quiz.audience.solo.title')).toBe('Indibidwal na tutor');
      expect(translate('fil', 'companyNav.students')).toBe('Mga estudyante');
    }
    expect(supportGeneralFollowUp('fil')).toBe('Ano pa ang maitutulong ko sa iyo?');
    expect(t('fil', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('Para magkansela, kailangan mong bayaran ang €25 na multa.');
    expect(t('fil', 'stuSess.lateCancelNoRefund')).toContain('lampas sa palugit');
    expect(t('fil', 'stuSched.monthlyBillingReserved')).toContain('Hindi mo kailangang magbayad ngayon');
    expect(t('fil', 'common.delete')).not.toBe(t('fil', 'cal.cancel'));
  });

  it('keeps destructive warnings, payment restrictions and explanatory source context', () => {
    expect(fil['studentSettings.confirmDeleteMsg']).toContain('Hindi na ito maibabalik');
    expect(fil['stuSched.mustPayDesc']).toContain('Hindi ka makakapag-book');
    expect(fil['studentWait.tooltip']).toContain('listahan ng naghihintay');
    expect(fil['compSet.payDesc']).toContain('binawasan ng sahod');
    expect(fil['compSch.confirmNoAvailability']).toContain('Gawin pa rin ang sesyon?');
    expect(fil['dash.invoice']).toBe('Invoice');
    expect(fil['invoice.invoiceTitle']).toBe('Invoice');
    const html = tHtml('fil', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
  });

  it('formats and parses Filipino calendar dates, weekdays, time and relative dates', () => {
    const locale = getDateFnsLocale('fil');
    const date = new Date(2026, 7, 31, 14, 30);
    expect(locale?.code).toBe('fil-PH');
    expect(format(date, 'EEEE, MMMM d, yyyy', { locale })).toBe('Lunes, Agosto 31, 2026');
    for (let month = 0; month < 12; month++) {
      const fixture = new Date(2026, month, 12, 14, 30);
      for (const pattern of ['PPPP', 'PPPp', 'PP', 'P', 'MMMM d, yyyy', 'MMM d, yyyy', 'do MMMM yyyy']) {
        const text = format(fixture, pattern, { locale });
        expect(format(parse(text, pattern, date, { locale }), pattern, { locale })).toBe(text);
      }
    }
    expect(format(date, 'p', { locale })).toBe('2:30 PM');
    expect(formatDistanceStrict(new Date(2026, 7, 31, 12, 30), date, { locale, addSuffix: true })).toBe('2 oras ang nakalipas');
    expect(formatRelative(new Date(2026, 8, 1, 14, 30), date, { locale })).toBe('bukas nang 2:30 PM');
  });

  it('supports Philippine phone numbers without changing Lithuanian validation', () => {
    expect(formatLocalizedPhone('+63 917 123 4567', 'fil')).toBe('+639171234567');
    expect(validateLocalizedPhone('+639171234567', 'fil')).toBe(true);
    expect(validateLocalizedPhone('09171234567', 'fil')).toBe(false);
    expect(getLocalizedPhonePlaceholder('fil')).toBe('+63 917 123 4567');
    expect(validateLocalizedPhone('+639171234567', 'lt')).toBe(false);
    expect(validateLocalizedPhone('+37061234567', 'lt')).toBe(true);
  });

  it('localizes public booking and metadata without publishing the locale', () => {
    expect(LOCALE_FORMAT_TAGS.fil).toBe('fil-PH');
    expect(htmlLanguageCode('fil')).toBe('fil');
    expect(localeDirection('fil')).toBe('ltr');
    expect(isTranslatedLocale('fil')).toBe(false);
    expect(getSeoMeta('fil', 'landing').title).toContain('pamamahala');
    expect(getSeoMeta('fil', 'pricing').title).toContain('Mga presyo');
    expect(Object.keys(CHROME.fil).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('fil').book).toBe('Mag-book ng sesyon');
    expect(chromeFor('fil').enquirySentTitle).toBe('Naipadala ang kahilingan');
    expect(formatShortDay('2026-08-22', 'fil')).toBe('Ago 22');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
  });
});
