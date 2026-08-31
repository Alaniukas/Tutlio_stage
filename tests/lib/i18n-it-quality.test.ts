import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { it as italian, itOverrides } from '../../src/lib/i18n/it';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';

// Explicit scope: tutor/business UI, connected student/parent flows and marketing.
// These separate products/policies intentionally retain the English fallback.
const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => {
  await loadLocaleDict('it');
});

describe('Italian tutor and business localization', () => {
  it('explicitly covers every in-scope source key without inventing keys', () => {
    expect(Object.keys(itOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(italian).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !italian[key])).toEqual([]);
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across the entire translation', (_label, pattern) => {
    const mismatches = expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(italian[key], pattern)),
    );
    expect(mismatches).toEqual([]);
  });

  it('loads Italian consistently in the browser, email and SSR dictionaries', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('it', 'common.login')).toBe('Accedi');
      expect(translate('it', 'companyNav.students')).toBe('Studenti');
      expect(translate('it', 'chat.title')).toBe('Messaggi');
      expect(translate('it', 'quiz.audience.solo.title')).toBe('Tutor indipendente');
    }
    expect(emailText('it', 'em.payReminderBodyOther', { student: 'Mario' }))
      .toBe('Lo studente <strong>Mario</strong> non ha ancora pagato la lezione.');
    expect(supportGeneralFollowUp('it')).toBe('In cos’altro posso aiutarti?');
  });

  it('escapes user content while keeping translated HTML and payment meaning', () => {
    const html = tHtml('it', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('it', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Per annullare, devi pagare la penale di €25.');
    expect(italian['cal.cancel']).toBe('Annulla');
    expect(italian['common.delete']).toBe('Elimina');
    expect(italian['compStu.paid']).toBe('Pagato');
    expect(italian['invoices.statusPaid']).toBe('Pagata');
  });

  it('keeps explanatory copy instead of reproducing terse source placeholders', () => {
    expect(italian['studentWait.tooltip']).toContain("lista d'attesa");
    expect(italian['compSet.payDesc']).toContain('differenza');
    expect(italian['stuSched.mustPayDesc']).toContain('non puoi prenotare');
    expect(italian['compSch.confirmNoAvailability']).toContain('Creare comunque la lezione?');
    expect(italian['dash.invoice']).toBe('Fattura');
    expect(italian['invoice.invoiceTitle']).toBe('Fattura');
  });

  it('uses Italian formatting and metadata without publishing the locale', () => {
    expect(LOCALE_FORMAT_TAGS.it).toBe('it-IT');
    expect(getDateFnsLocale('it').code).toBe('it');
    expect(getSeoMeta('it', 'landing').title).toBe('Software per la gestione di tutor e scuole | Tutlio');
    expect(getSeoMeta('it', 'pricing').title).toContain('Prezzi');
    expect(isTranslatedLocale('it')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(italian[key]).toBe(en[key]);
    }
  });

  it('localizes public booking labels and dates while preserving other locale fallbacks', () => {
    expect(Object.keys(CHROME.it).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('it').book).toBe('Prenota una lezione');
    expect(chromeFor('it').enquirySentTitle).toBe('Richiesta inviata');
    expect(formatShortDay('2026-08-22', 'it')).toBe('22 ago');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    expect(chromeFor('fr')).toBe(CHROME.en);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.it[key]).not.toBe('');
      expect(tokens(CHROME.it[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });
});
