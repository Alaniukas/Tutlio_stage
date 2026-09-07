import { beforeAll, describe, expect, it } from 'vitest';
import { format, parse } from 'date-fns';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { uk, ukOverrides } from '../../src/lib/i18n/uk';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, LOCALE_LABELS, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { formatLocalizedPhone, validateLocalizedPhone, getLocalizedPhonePlaceholder } from '../../src/lib/utils';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter(key => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const phoneCorrections = new Set(['onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError', 'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat']);
// Restore arguments already passed by the UI/email callers to damaged source entries.
const restored: Record<string, string[]> = {
};
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();
beforeAll(async () => { await loadLocaleDict('uk'); });

describe('Ukrainian tutor and business localization', () => {
  it('covers the full agreed scope and preserves deferred English fallback', () => {
    expect(Object.keys(ukOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(uk).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter(key => en[key] && !uk[key])).toEqual([]);
    for (const key of Object.keys(en).filter(key => deferred.has(key.split('.')[0]))) expect(uk[key]).toBe(en[key]);
  });
  it.each([
    ['markup', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency', /[€$£]|\b(?:EUR|PLN|USD|GBP|UAH)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s throughout the scope', (_label, pattern) => {
    expect(expectedKeys.filter(key => JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(uk[key], pattern)))).toEqual([]);
  });
  it('preserves numeric claims, except six international phone-copy corrections', () => {
    const pattern = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter(key => !phoneCorrections.has(key) && JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(uk[key], pattern)))).toEqual([]);
    for (const key of phoneCorrections) {
      expect(uk[key]).toContain('+380 67 123 4567');
      expect(uk[key]).not.toContain('+370');
    }
  });
  it('preserves source arguments and restores only documented caller arguments', () => {
    const pattern = /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g;
    expect(expectedKeys.filter(key => JSON.stringify([...tokens(en[key], pattern), ...(restored[key] ?? [])].sort()) !== JSON.stringify(tokens(uk[key], pattern)))).toEqual([]);
    expect(t('uk', 'em.payReminderTiming', { hours: 24, timing: t('uk', 'em.payReminderBefore') })).toBe('24 год до заняття');
    expect(t('uk', 'em.payReminderTiming', { hours: 2, timing: t('uk', 'em.payReminderAfter') })).toBe('2 год після заняття');
    expect(t('uk', 'compStu.cancellationInfo', { hours: 24, percent: 50 })).toBe('Скасування: за 24 год до заняття (плата 50%)');
    expect(t('uk', 'invoice.emailNote', { days: 7 })).toContain('7 днів');
    expect(t('uk', 'studentWait.addedOn', { date: '31 серп.' })).toBe('Додано 31 серп.');
  });
  it('keeps payment, availability, deletion and markup semantics', () => {
    expect(uk['status.complimentary']).toBe('Безкоштовне');
    expect(uk['studentSettings.confirmDeleteMsg']).toContain('неможливо скасувати');
    expect(uk['stuSched.mustPayDesc']).toContain('не зможете бронювати');
    expect(uk['compSet.payDesc']).toContain('різниця між ціною заняття й винагородою');
    expect(uk['findLesson.reserveTrial']).toContain('посилання на оплату');
    expect(uk['em.payReminderDeadline']).toBe('Термін оплати');
    expect(uk['dash.invoice']).toBe('Рахунок');
    const html = tHtml('uk', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    for (const translate of [t, emailText, ssrText]) expect(translate('uk', 'quiz.audience.solo.title')).toBe('Індивідуальний репетитор');
  });
  it('formats and parses native Ukrainian dates across all months', () => {
    const locale = getDateFnsLocale('uk');
    expect(locale?.code).toBe('uk');
    const date = new Date(2026, 7, 31, 14, 30);
    expect(format(date, 'EEEE, d MMMM yyyy', { locale })).toBe('понеділок, 31 серпня 2026');
    expect(format(date, 'HH:mm', { locale })).toBe('14:30');
    for (let month = 0; month < 12; month++) {
      const fixture = new Date(2026, month, 12, 14, 30);
      for (const pattern of ['PPPP', 'PPPp', 'PP', 'P', 'd MMMM yyyy', 'd MMM yyyy']) {
        const text = format(fixture, pattern, { locale });
        expect(format(parse(text, pattern, date, { locale }), pattern, { locale })).toBe(text);
      }
    }
  });
  it('supports Ukrainian phone examples without restricting other international numbers', () => {
    expect(formatLocalizedPhone('+380 67 123 4567', 'uk')).toBe('+380671234567');
    expect(validateLocalizedPhone('+380671234567', 'uk')).toBe(true);
    expect(validateLocalizedPhone('+48600123456', 'uk')).toBe(true);
    expect(validateLocalizedPhone('0671234567', 'uk')).toBe(false);
    expect(getLocalizedPhonePlaceholder('uk')).toBe('+380 67 123 4567');
    expect(validateLocalizedPhone('+380671234567', 'lt')).toBe(false);
    expect(validateLocalizedPhone('+37061234567', 'lt')).toBe(true);
  });
  it('localizes public booking while keeping Ukrainian unpublished', () => {
    expect(LOCALE_LABELS.uk).toBe('UA');
    expect(LOCALE_FORMAT_TAGS.uk).toBe('uk-UA');
    expect(htmlLanguageCode('uk')).toBe('uk');
    expect(localeDirection('uk')).toBe('ltr');
    expect(isTranslatedLocale('uk')).toBe(false);
    expect(getSeoMeta('uk', 'landing').title).toContain('репетиторів');
    expect(Object.keys(CHROME.uk).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(formatShortDay('2026-08-22', 'uk')).toBe('22 серп.');
    expect(chromeFor('uk').book).toBe('Забронювати заняття');
    expect(chromeFor('uk').enquirySentBody).toContain('щоб підтвердити час');
  });
});
