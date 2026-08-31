import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { bg, bgOverrides } from '../../src/lib/i18n/bg';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { getLocalizedPhonePlaceholder, formatLocalizedPhone, validateLocalizedPhone } from '../../src/lib/utils';
import { getLandingDemoPersonas } from '../../src/components/landing/v2/demoPersonas';
import { getCaseStudy, getTestimonials, SHOW_PLACEHOLDER_SOCIAL_PROOF } from '../../src/components/landing/v2/socialProof';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();
// These source hints incorrectly impose Lithuanian rules on international forms.
// BG uses the existing international validator; only these obsolete phone limits
// are removed. Prices, percentages, deadlines and other numbers remain protected.
const internationalPhoneHints = new Set([
  'onboard.parentPhoneFormat', 'onboard.phoneFormatError',
  'register.phoneError', 'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat',
]);

beforeAll(async () => { await loadLocaleDict('bg'); });

describe('Bulgarian tutor and business localization', () => {
  it('explicitly covers the requested flows and preserves deliberate fallback boundaries', () => {
    expect(Object.keys(bgOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !bg[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) {
      expect(bg[key], key).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s except documented international-phone corrections', (label, pattern) => {
    expect(expectedKeys.filter((key) =>
      !(label === 'numeric values' && internationalPhoneHints.has(key)) &&
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(bg[key], pattern)),
    )).toEqual([]);
  });

  it('loads Bulgarian across browser, email and server rendering', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('bg', 'quiz.audience.solo.title')).toBe('Самостоятелен преподавател');
      expect(translate('bg', 'companyNav.students')).toBe('Ученици');
      expect(translate('bg', 'stuSched.payBtn')).toBe('Плащане');
    }
    expect(emailText('bg', 'em.payReminderBodyOther', { student: 'Иван' }))
      .toBe('Ученикът <strong>Иван</strong> все още не е платил за урока.');
    expect(supportGeneralFollowUp('bg')).toBe('С какво друго мога да помогна?');
  });

  it('escapes user content and keeps cancellation, payment and refund meaning distinct', () => {
    const html = tHtml('bg', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('bg', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('За да отмените, трябва да платите неустойка от €25.');
    expect(bg['cal.cancel']).toBe('Отмяна');
    expect(bg['invoices.statusPaid']).toBe('Платена');
    expect(bg['compSet.payDesc']).toContain('разликата');
    expect(bg['stuSess.refundSuccessManualTutor']).toContain('няма автоматично възстановяване');
  });

  it('provides explanations for source placeholders using their screen context', () => {
    expect(bg['studentWait.tooltip']).toContain('Списъкът');
    expect(bg['stuSched.mustPayDesc']).toContain('не можете да записвате');
    expect(bg['compSch.confirmNoAvailability']).toContain('Да се създаде ли урокът');
    expect(bg['studentSettings.confirmDeleteMsg']).toContain('необратимо');
    expect(bg['dash.invoice']).toBe('Фактура');
    expect(bg['invoice.invoiceTitle']).toBe('Фактура');
  });

  it('uses Bulgarian dates and metadata without promoting the locale', () => {
    expect(LOCALE_FORMAT_TAGS.bg).toBe('bg-BG');
    expect(getDateFnsLocale('bg').code).toBe('bg');
    expect(formatShortDay('2026-08-22', 'bg')).toBe('22.08');
    expect(getSeoMeta('bg', 'landing').title).toContain('учебни центрове');
    expect(getSeoMeta('bg', 'pricing').title).toContain('Цени');
    expect(isTranslatedLocale('bg')).toBe(false);
  });

  it('localizes the complete public booking interface while keeping neutral demo identities', () => {
    expect(Object.keys(CHROME.bg).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('bg').book).toBe('Записване на урок');
    expect(chromeFor('bg').enquirySentTitle).toBe('Запитването е изпратено');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    const demo = getLandingDemoPersonas('bg');
    expect(demo.families[0]).toBe('Семейство Miller');
    expect(demo.publicTutor).toBe(getLandingDemoPersonas('en').publicTutor);
    expect(demo.profileEmail).toBe(getLandingDemoPersonas('en').profileEmail);
    expect(getCaseStudy('bg').stats.map((stat) => stat.value))
      .toEqual(getCaseStudy('en').stats.map((stat) => stat.value));
    expect(getTestimonials('bg').map(({ name, rating }) => ({ name, rating })))
      .toEqual(getTestimonials('en').map(({ name, rating }) => ({ name, rating })));
    expect(SHOW_PLACEHOLDER_SOCIAL_PROOF).toBe(false);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.bg[key]).not.toBe('');
      expect(tokens(CHROME.bg[key], /\d+(?:[.,]\d+)?/g))
        .toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('accepts Bulgarian international numbers without Lithuanian rewriting', () => {
    for (const key of internationalPhoneHints) {
      expect(bg[key], key).not.toContain('+370');
      expect(bg[key], key).toContain('код на държавата');
    }
    expect(getLocalizedPhonePlaceholder('bg')).toBe('+359 88 123 4567');
    expect(formatLocalizedPhone('+359 88 123 4567', 'bg')).toBe('+359881234567');
    expect(validateLocalizedPhone('+359 88 123 4567', 'bg')).toBe(true);
    expect(validateLocalizedPhone('+359', 'bg')).toBe(false);
    expect(validateLocalizedPhone('881234567', 'bg')).toBe(false);
  });
});
