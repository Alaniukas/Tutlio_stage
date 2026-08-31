import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { lt } from '../../src/lib/i18n/lt';
import { sl, slOverrides } from '../../src/lib/i18n/sl';
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
// These form errors now describe the existing international validator and use
// a Slovenian example; monetary values elsewhere must still match the source.
const phoneExampleKeys = new Set([
  'onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError',
  'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat', 'compStu.phoneFormat',
]);

// These English entries lost parameters or explanations that still exist in
// the LT source and their callers. Verify the recovered contracts explicitly.
const recoveredFromLt = new Set([
  'cal.addStudentsSuccess', 'cal.cancelledCount', 'cal.groupFull', 'cal.massCancelDesc',
  'cal.notEnoughSpots', 'cal.syncSendFailed', 'cal.syncSessionError', 'cal.syncSuccess',
  'compStu.cancellationInfo', 'compStu.packageSent', 'compStu.pricingSaveFailed',
  'compTut.studentReminderHint', 'em.invoiceBody', 'finance.deadlineWarning',
  'invoice.emailNote', 'orgFinance.completedLessons', 'register.orgInvite', 'stuSched.queueClosedDesc',
]);
const callerContracts: Record<string, string> = {
  'cal.studentGrade': '{name} (razred: {grade})',
  'companyWait.inQueueSince': '{date}',
  'studentWait.addedOn': '{date}',
  'compSch.seriesSummaryHtml': '{fromDate} {weekday} {timeRange}',
  'em.payReminderTiming': '{hours} h {timing}',
};
const reference = (key: string) => callerContracts[key] ?? (recoveredFromLt.has(key) ? lt[key] : en[key]);

beforeAll(async () => { await loadLocaleDict('sl'); });

describe('Slovenian tutor and business localization', () => {
  it('explicitly covers the tutor/business scope and keeps deferred modules in English', () => {
    expect(Object.keys(slOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(sl).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !sl[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(sl[key]).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s throughout the dictionary', (_label, pattern) => {
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(reference(key), pattern)) !== JSON.stringify(tokens(sl[key], pattern)),
    )).toEqual([]);
  });

  it('preserves numeric claims and amounts except explicitly localized phone examples', () => {
    const numbers = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter((key) => !phoneExampleKeys.has(key) &&
      JSON.stringify(tokens(reference(key), numbers)) !== JSON.stringify(tokens(sl[key], numbers)),
    )).toEqual([]);
    for (const key of phoneExampleKeys) {
      expect(sl[key]).toContain('+386 40 123 456');
      expect(sl[key]).not.toContain('+370');
    }
  });

  it('loads Slovenian in browser, email and SSR paths', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('sl', 'common.login')).toBe('Prijava');
      expect(translate('sl', 'companyNav.students')).toBe('Učenci');
      expect(translate('sl', 'chat.title')).toBe('Sporočila');
      expect(translate('sl', 'quiz.audience.solo.title')).toBe('Samostojni inštruktor');
    }
    expect(emailText('sl', 'em.payReminderBodyOther', { student: 'Ana' }))
      .toBe('Učenec <strong>Ana</strong> ure še ni plačal.');
    expect(supportGeneralFollowUp('sl')).toBe('Kako vam lahko še pomagam?');
  });

  it('escapes user content and distinguishes payment, cancellation and deletion', () => {
    const html = tHtml('sl', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('sl', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Za odpoved morate plačati strošek v višini €25.');
    expect(sl['common.cancel']).toBe('Prekliči');
    expect(sl['studentDash.cancelLesson']).toBe('Odpovej uro');
    expect(sl['common.delete']).toBe('Izbriši');
    expect(sl['cal.studentMarkedPaid']).toBe('Učenec je označil kot plačano');
    expect(sl['invoices.statusPaid']).toBe('Plačan');
  });

  it('restores explanatory meaning where the English source is abbreviated', () => {
    expect(sl['studentWait.tooltip']).toContain('Čakalni seznam');
    expect(sl['compSet.payDesc']).toContain('cena ure − plačilo inštruktorju');
    expect(sl['stuSched.mustPayDesc']).toContain('ne morete rezervirati');
    expect(sl['studentSettings.confirmDeleteMsg']).toContain('ni mogoče razveljaviti');
    expect(sl['compSch.confirmNoAvailability']).toContain('Ali vseeno ustvarim uro?');
    expect(sl['dash.invoice']).toBe('Račun');
    expect(sl['invoice.invoiceTitle']).toBe('Račun');
    expect(sl['em.payReminderDeadline']).toBe('Rok plačila');
    expect(t('sl', 'invoice.emailNote', { days: 7 })).toContain('Rok plačila: 7 dni.');
    expect(t('sl', 'studentWait.addedOn', { date: '22. avg.' })).toBe('Dodano: 22. avg.');
    expect(t('sl', 'companyWait.inQueueSince', { date: '2026-08-22 12:00' }))
      .toBe('Na čakalnem seznamu od 2026-08-22 12:00');
    expect(t('sl', 'cal.studentGrade', { name: 'Jan', grade: '8' })).toBe('Jan (razred: 8)');
    expect(t('sl', 'compSch.seriesSummaryHtml', { fromDate: '2026-09-01', weekday: 'torek', timeRange: '16:00–17:00' }))
      .toContain('2026-09-01 uporabljajo nov termin: torek, 16:00–17:00.');
  });

  it('uses Slovenian dates and metadata while remaining unpublished', () => {
    expect(LOCALE_FORMAT_TAGS.sl).toBe('sl-SI');
    expect(getDateFnsLocale('sl').code).toBe('sl');
    expect(getSeoMeta('sl', 'landing').title).toContain('inštrukcijska podjetja');
    expect(getSeoMeta('sl', 'pricing').title).toContain('Cene');
    expect(isTranslatedLocale('sl')).toBe(false);
    expect(formatShortDay('2026-08-22', 'sl')).toBe(
      new Date('2026-08-22T12:00:00').toLocaleDateString('sl-SI', { month: 'short', day: 'numeric' }),
    );
    expect(formatShortDay('2026-08-22', 'sl')).not.toContain('Aug');
  });

  it('covers public booking states and keeps other locale fallbacks unchanged', () => {
    expect(Object.keys(CHROME.sl).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('sl').book).toBe('Rezerviraj uro');
    expect(chromeFor('sl').enquirySentTitle).toBe('Povpraševanje je poslano');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('fr')).toBe(CHROME.en);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.sl[key]).not.toBe('');
      expect(tokens(CHROME.sl[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('accepts Slovenian international phone numbers without forcing a Lithuanian prefix', () => {
    expect(getLocalizedPhonePlaceholder('sl')).toBe('+386 40 123 456');
    expect(formatLocalizedPhone('+386 40 123 456', 'sl')).toBe('+38640123456');
    expect(validateLocalizedPhone('+386 40 123 456', 'sl')).toBe(true);
    expect(validateLocalizedPhone('040123456', 'sl')).toBe(false);
    expect(validateLocalizedPhone('+44 7700 900123', 'sl')).toBe(true);
  });
});
