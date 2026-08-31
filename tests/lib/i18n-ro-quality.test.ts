import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { ro, roOverrides } from '../../src/lib/i18n/ro';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

// These examples deliberately replace Lithuania-only source instructions: the
// actual non-Lithuanian phone helper accepts international numbers. Prices,
// deadlines, identifiers and all other numerical source contracts stay intact.
const localizedPhoneKeys = new Set([
  'register.phoneError', 'register.phoneHint', 'register.phonePlaceholder',
  'onboard.phoneFormatError', 'onboard.parentPhoneFormat', 'settings.phoneFormat',
  'stu.phoneFormat', 'compStu.phoneFormat', 'studentSettings.phoneFormatError',
]);

beforeAll(async () => { await loadLocaleDict('ro'); });

describe('Romanian tutor and business localization', () => {
  it('explicitly covers the tutor/business scope and preserves source keys', () => {
    expect(Object.keys(roOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(ro).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !ro[key])).toEqual([]);
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across every translated key', (_label, pattern) => {
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(ro[key], pattern)),
    )).toEqual([]);
  });

  it('preserves numeric values except the explicitly localized phone examples', () => {
    const pattern = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter((key) => !localizedPhoneKeys.has(key) &&
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(ro[key], pattern)),
    )).toEqual([]);
    for (const key of localizedPhoneKeys) {
      expect(ro[key]).toContain('+40');
      expect(ro[key]).not.toContain('+370');
    }
  });

  it('loads Romanian consistently for the browser, email and server-rendered pages', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('ro', 'common.login')).toBe('Autentificare');
      expect(translate('ro', 'companyNav.students')).toBe('Elevi');
      expect(translate('ro', 'chat.title')).toBe('Mesaje');
      expect(translate('ro', 'quiz.audience.solo.title')).toBe('Profesor independent');
    }
    expect(emailText('ro', 'em.payReminderBodyOther', { student: 'Andrei' }))
      .toBe('Elevul <strong>Andrei</strong> nu a achitat încă lecția.');
    expect(supportGeneralFollowUp('ro')).toBe('Cu ce te mai pot ajuta?');
  });

  it('escapes user text in refund HTML and retains cancellation payment meaning', () => {
    const html = tHtml('ro', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('ro', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Pentru a anula, trebuie să achiți penalizarea de €25.');
    expect(ro['cal.cancel']).toBe('Anulează');
    expect(ro['common.delete']).toBe('Șterge');
    expect(ro['compStu.paid']).toBe('Achitat');
    expect(ro['invoices.statusPaid']).toBe('Achitată');
  });

  it('explains source placeholders using their actual application context', () => {
    expect(ro['studentWait.tooltip']).toContain('Lista de așteptare');
    expect(ro['compSet.payDesc']).toContain('diferența');
    expect(ro['stuSched.mustPayDesc']).toContain('nu poți rezerva');
    expect(ro['compSch.confirmNoAvailability']).toContain('Creezi totuși lecția?');
    expect(ro['studentSettings.confirmDeleteMsg']).toContain('ireversibilă');
    expect(ro['dash.invoice']).toBe('Factură');
    expect(ro['invoice.invoiceTitle']).toBe('Factură');
  });

  it('uses Romanian dates and metadata without publishing unfinished modules', () => {
    expect(LOCALE_FORMAT_TAGS.ro).toBe('ro-RO');
    expect(getDateFnsLocale('ro').code).toBe('ro');
    expect(getSeoMeta('ro', 'landing').title).toContain('centre de meditații');
    expect(getSeoMeta('ro', 'pricing').title).toContain('Prețuri');
    expect(isTranslatedLocale('ro')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(ro[key]).toBe(en[key]);
    }
  });

  it('localizes the public booking interface without changing other fallbacks', () => {
    expect(Object.keys(CHROME.ro).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('ro').book).toBe('Rezervă o lecție');
    expect(chromeFor('ro').enquirySentTitle).toBe('Cerere trimisă');
    expect(formatShortDay('2026-08-22', 'ro')).toBe('22 aug.');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    expect(chromeFor('fr')).toBe(CHROME.en);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.ro[key]).not.toBe('');
      expect(tokens(CHROME.ro[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('accepts Romanian and other international numbers without imposing Lithuania rules', () => {
    expect(getLocalizedPhonePlaceholder('ro')).toBe('+40 712 345 678');
    expect(formatLocalizedPhone('+40 712 345 678', 'ro')).toBe('+40712345678');
    expect(validateLocalizedPhone('+40 712 345 678', 'ro')).toBe(true);
    expect(validateLocalizedPhone('+44 7700 900000', 'ro')).toBe(true);
    expect(validateLocalizedPhone('0712345678', 'ro')).toBe(false);
    expect(validateLocalizedPhone('+40712345678', 'lt')).toBe(false);
  });
});
