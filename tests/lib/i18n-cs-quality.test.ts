import { beforeAll, describe, expect, it } from 'vitest';
import { format, parse } from 'date-fns';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { cs, csOverrides } from '../../src/lib/i18n/cs';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { htmlLanguageCode, localeDirection, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { hasBlogSchema, hasLocalizedAssets, isSeoPublished, selectableLocales } from '../../src/lib/i18n/localeRelease';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';
import { getLandingDemoPersonas } from '../../src/components/landing/v2/demoPersonas';
import { getCaseStudy, getTestimonials, SHOW_PLACEHOLDER_SOCIAL_PROOF } from '../../src/components/landing/v2/socialProof';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => { await loadLocaleDict('cs'); });

describe('Czech tutor and business localization', () => {
  it('explicitly covers the agreed scope while retaining dedicated school/admin/legal fallback', () => {
    expect(Object.keys(csOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(cs).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !cs[key])).toEqual([]);
    expect(expectedKeys.filter((key) => key.startsWith('quiz.'))).toHaveLength(493);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) {
      expect(cs[key], key).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across every scoped key', (_label, pattern) => {
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(cs[key], pattern)),
    )).toEqual([]);
  });

  it('loads the same Czech copy for browser, server email, and SSR', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('cs', 'common.login')).toBe('Přihlásit se');
      expect(translate('cs', 'companyNav.students')).toBe('Studenti');
      expect(translate('cs', 'chat.title')).toBe('Zprávy');
      expect(translate('cs', 'quiz.audience.solo.title')).toBe('Samostatný lektor');
    }
    expect(supportGeneralFollowUp('cs')).toBe('S čím vám ještě mohu pomoci?');
  });

  it('retains the conditions in payment restrictions, cancellation and deletion warnings', () => {
    expect(t('cs', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('Pro zrušení musíte uhradit poplatek €25.');
    expect(cs['cal.cancel']).toBe('Zrušit');
    expect(cs['common.delete']).toBe('Odstranit');
    expect(cs['compStu.paid']).toBe('Uhrazeno');
    expect(cs['compSet.payDesc']).toContain('rozdíl mezi cenou lekce a odměnou lektora');
    expect(cs['stuSched.payBtn']).toBe('Zaplatit');
    expect(emailText('cs', 'em.cancelBefore', { hours: 24, fee: 'poplatek 50%' }))
      .toBe('Méně než 24 hod. před lekcí: poplatek 50%');
    expect(cs['studentSettings.confirmDeleteMsg']).toContain('nevratný');
    expect(cs['stuSched.mustPayDesc']).toContain('nemůžete rezervovat');
    expect(cs['stuSched.mustPayQueue']).toContain('nemůžete se přidat na čekací listinu');
    expect(cs['compSch.confirmNoAvailability']).toContain('Přesto vytvořit lekci?');
    expect(cs['dash.invoice']).toBe('Faktura');
    expect(cs['invoice.invoiceTitle']).toBe('Faktura');
    expect(cs['auth.saveNewPassword']).toBe('Uložit nové heslo');
    expect(cs['common.updating']).toBe('Aktualizuje se...');
    expect(cs['dash.confirmPayment']).toBe('Potvrdit platbu');
    expect(t('cs', 'cal.addStudentsBtn', { count: 3 })).toBe('Přidat (3)');
    const html = tHtml('cs', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
  });

  it('keeps lesson counts distinct from hours with the legacy plural selectors', () => {
    for (const key of ['em.lessonSingular', 'em.lessonFew', 'em.lessonMany', 'package.lessonUnit1', 'package.lessonUnit2to9', 'package.lessonUnit10plus']) {
      expect(cs[key], key).toBe('lek.');
    }
    expect(emailText('cs', 'em.payReminderTiming', { hours: 24, timing: cs['em.payReminderBefore'] })).toBe('24 h před začátkem lekce');
    expect(emailText('cs', 'em.payReminderTiming', { hours: 2, timing: cs['em.payReminderAfter'] })).toBe('2 h po skončení lekce');
    expect(t('cs', 'invoice.emailNote', { days: 7 })).toContain('Lhůta úhrady: 7 d.');
  });

  it('formats and parses Czech dates, including every weekday, with Monday-first weeks', () => {
    expect(LOCALE_FORMAT_TAGS.cs).toBe('cs-CZ');
    expect(htmlLanguageCode('cs')).toBe('cs');
    expect(localeDirection('cs')).toBe('ltr');
    const locale = getDateFnsLocale('cs');
    expect(locale.code).toBe('cs');
    expect(locale.options?.weekStartsOn).toBe(1);
    const reference = new Date(2026, 7, 31, 14, 30);
    expect(format(reference, 'EEEE', { locale })).toBe('pondělí');
    for (let month = 0; month < 12; month++) {
      for (let day = 12; day < 19; day++) {
        const fixture = new Date(2026, month, day, 14, 30);
        for (const pattern of ['P', 'PP', 'PPP', 'PPPP', 'PPPp']) {
          const text = format(fixture, pattern, { locale });
          expect(format(parse(text, pattern, reference, { locale }), pattern, { locale })).toBe(text);
        }
      }
    }
    expect(formatShortDay('2026-08-22', 'cs')).toBe('22. 8.');
  });

  it('supports Czech phone numbers without loosening Lithuania-specific validation', () => {
    expect(formatLocalizedPhone('+420 601 123 456', 'cs')).toBe('+420601123456');
    expect(validateLocalizedPhone('+420601123456', 'cs')).toBe(true);
    expect(validateLocalizedPhone('601123456', 'cs')).toBe(false);
    expect(getLocalizedPhonePlaceholder('cs')).toBe('+420 601 123 456');
    expect(validateLocalizedPhone('+420601123456', 'lt')).toBe(false);
    expect(validateLocalizedPhone('+37061234567', 'lt')).toBe(true);
  });

  it('localizes public booking and metadata without inventing customer identities or claims', () => {
    expect(Object.keys(CHROME.cs).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('cs').book).toBe('Rezervovat lekci');
    expect(chromeFor('cs').enquirySentTitle).toBe('Žádost byla odeslána');
    expect(getSeoMeta('cs', 'landing').title).toContain('lektory');
    expect(getSeoMeta('cs', 'pricing').title).toContain('Ceník');
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.cs[key]).not.toBe('');
      expect(tokens(CHROME.cs[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
    expect(getLandingDemoPersonas('cs').publicTutor).toBe(getLandingDemoPersonas('en').publicTutor);
    expect(getLandingDemoPersonas('cs').profilePhone).toBe(getLandingDemoPersonas('en').profilePhone);
    expect(getCaseStudy('cs').stats.map((s) => s.value)).toEqual(getCaseStudy('en').stats.map((s) => s.value));
    expect(getTestimonials('cs').map((s) => [s.name, s.rating, s.photo])).toEqual(getTestimonials('en').map((s) => [s.name, s.rating, s.photo]));
    expect(SHOW_PLACEHOLDER_SOCIAL_PROOF).toBe(false);
  });

  it('publishes the UI without publishing SEO, blog columns or localized assets', () => {
    expect(selectableLocales(true)).toContain('cs');
    expect(selectableLocales()).toContain('cs');
    expect(hasBlogSchema('cs')).toBe(false);
    expect(hasLocalizedAssets('cs')).toBe(false);
    for (const path of ['/cs/pricing', '/cs/features', '/cs/terms', '/cs/blog', '/cs/tutor/example', '/schools/cs/pricing']) {
      expect(isSeoPublished('cs', path), path).toBe(!/\/(terms|privacy-policy|dpa|blog)(\/|$)/.test(path));
    }
  });
});
