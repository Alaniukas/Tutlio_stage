import { beforeAll, describe, expect, it } from 'vitest';
import { format, parse } from 'date-fns';
import { readFileSync } from 'node:fs';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { sk, skOverrides } from '../../src/lib/i18n/sk';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { htmlLanguageCode, isTranslatedLocale, localeDirection, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';
import { getLandingDemoPersonas } from '../../src/components/landing/v2/demoPersonas';
import { getCaseStudy, getTestimonials, SHOW_PLACEHOLDER_SOCIAL_PROOF } from '../../src/components/landing/v2/socialProof';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();


beforeAll(async () => { await loadLocaleDict('sk'); });

describe('Slovak tutor and business localization', () => {
  it('explicitly covers the full agreed scope, including the complete quiz', () => {
    expect(Object.keys(skOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(sk).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !sk[key])).toEqual([]);
    expect(expectedKeys.filter((key) => key.startsWith('quiz.')).length).toBe(493);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) {
      expect(sk[key], key).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across all scoped keys', (_label, pattern) => {
    const mismatches = expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(sk[key], pattern)),
    );
    expect(mismatches).toEqual([]);
  });

  it('loads Slovak consistently in browser, server email, and SSR dictionaries', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('sk', 'common.login')).toBe('Prihlásiť sa');
      expect(translate('sk', 'companyNav.students')).toBe('Študenti');
      expect(translate('sk', 'chat.title')).toBe('Správy');
      expect(translate('sk', 'quiz.audience.solo.title')).toBe('Samostatný doučovateľ');
    }
    expect(supportGeneralFollowUp('sk')).toBe('S čím vám ešte môžem pomôcť?');
  });

  it('preserves cancellation and payment meaning, complete warnings, and safe HTML', () => {
    expect(t('sk', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('Na zrušenie musíte uhradiť sankčný poplatok €25.');
    expect(sk['cal.cancel']).toBe('Zrušiť');
    expect(sk['common.delete']).toBe('Odstrániť');
    expect(sk['compStu.paid']).toBe('Uhradené');
    expect(sk['compSet.payDesc']).toContain('rozdiel medzi cenou hodiny a odmenou doučovateľa');
    expect(sk['stuSched.payBtn']).toBe('Zaplatiť');
    expect(sk['studentSettings.confirmDeleteMsg']).toContain('nezvratný');
    expect(sk['stuSched.mustPayDesc']).toContain('nemôžete rezervovať');
    expect(sk['compSch.confirmNoAvailability']).toContain('Napriek tomu vytvoriť hodinu?');
    expect(sk['dash.invoice']).toBe('Faktúra');
    expect(sk['invoice.invoiceTitle']).toBe('Faktúra');
    const html = tHtml('sk', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
  });

  it('uses neutral count units with legacy plural selectors and retains email deadlines', () => {
    for (const key of ['em.lessonSingular', 'em.lessonFew', 'em.lessonMany']) expect(sk[key]).toBe('hod.');
    expect(emailText('sk', 'em.payReminderTiming', { hours: 24, timing: sk['em.payReminderBefore'] })).toBe('24 h pred začiatkom hodiny');
    expect(emailText('sk', 'em.payReminderTiming', { hours: 2, timing: sk['em.payReminderAfter'] })).toBe('2 h po skončení hodiny');
    expect(sk['finance.paymentTiming']).toBe('Čas platby');
    expect(t('sk', 'invoice.emailNote', { days: 7 })).toContain('Lehota splatnosti: 7 d.');
  });

  it('uses Slovak dates, Monday-first weeks, and LTR without publishing the locale', () => {
    expect(LOCALE_FORMAT_TAGS.sk).toBe('sk-SK');
    expect(htmlLanguageCode('sk')).toBe('sk');
    expect(localeDirection('sk')).toBe('ltr');
    expect(isTranslatedLocale('sk')).toBe(false);
    const locale = getDateFnsLocale('sk');
    expect(locale.code).toBe('sk');
    expect(locale.options?.weekStartsOn).toBe(1);
    const date = new Date(2026, 7, 31, 14, 30);
    expect(format(date, 'EEEE', { locale })).toBe('pondelok');
    for (let month = 0; month < 12; month++) {
      const fixture = new Date(2026, month, 12, 14, 30);
      for (const pattern of ['P', 'PP', 'PPP', 'PPPP', 'PPPp']) {
        const text = format(fixture, pattern, { locale });
        expect(format(parse(text, pattern, date, { locale }), pattern, { locale })).toBe(text);
      }
    }
    expect(formatShortDay('2026-08-22', 'sk')).toBe('22. 8.');
  });

  it('supports Slovak phone examples and registration without changing LT validation', () => {
    expect(formatLocalizedPhone('+421 905 123 456', 'sk')).toBe('+421905123456');
    expect(validateLocalizedPhone('+421905123456', 'sk')).toBe(true);
    expect(validateLocalizedPhone('0905123456', 'sk')).toBe(false);
    expect(getLocalizedPhonePlaceholder('sk')).toBe('+421 905 123 456');
    expect(validateLocalizedPhone('+421905123456', 'lt')).toBe(false);
    expect(validateLocalizedPhone('+37061234567', 'lt')).toBe(true);
    const registration = readFileSync('src/pages/Register.tsx', 'utf8');
    expect(registration).toContain("locale === 'sk' ? '+421'");
    expect(registration).toContain("{ code: 'SK', label: 'Slovakia', dial: '+421' }");
  });

  it('localizes public booking and metadata while preserving demo identities and claims', () => {
    expect(Object.keys(CHROME.sk).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('sk').book).toBe('Rezervovať hodinu');
    expect(chromeFor('sk').enquirySentTitle).toBe('Žiadosť bola odoslaná');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    expect(getSeoMeta('sk', 'landing').title).toContain('doučovateľov');
    expect(getSeoMeta('sk', 'pricing').title).toContain('Ceny');
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.sk[key]).not.toBe('');
      expect(tokens(CHROME.sk[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
    expect(getLandingDemoPersonas('sk').publicTutor).toBe(getLandingDemoPersonas('en').publicTutor);
    expect(getLandingDemoPersonas('sk').profilePhone).toBe(getLandingDemoPersonas('en').profilePhone);
    expect(getCaseStudy('sk').stats.map((s) => s.value)).toEqual(getCaseStudy('en').stats.map((s) => s.value));
    expect(getTestimonials('sk').map((s) => [s.name, s.rating, s.photo])).toEqual(getTestimonials('en').map((s) => [s.name, s.rating, s.photo]));
    expect(SHOW_PLACEHOLDER_SOCIAL_PROOF).toBe(false);
  });
});
