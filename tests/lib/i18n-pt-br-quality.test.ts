import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { ptBr, ptBrOverrides } from '../../src/lib/i18n/pt-br';
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
// Portuguese decimal commas change presentation, never the amount.
const numbers = (value: string) => tokens(value, /\d+(?:[.,]\d+)?/g).map((token) => token.replace(',', '.')).sort();

// The source's LT-only phone instructions contradict the existing non-LT validator.
// Correcting that guidance does not change validation, money or product limits.
const correctedPhoneKeys = [
  'onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError',
  'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat',
];

beforeAll(async () => { await loadLocaleDict('pt-br'); });

describe('Brazilian Portuguese tutor and business localization', () => {
  it('explicitly covers every in-scope source key, including the entire onboarding quiz', () => {
    expect(Object.keys(ptBrOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(ptBr).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !ptBr[key])).toEqual([]);
    expect(Object.keys(ptBrOverrides).filter((key) => key.startsWith('quiz.')).sort())
      .toEqual(Object.keys(en).filter((key) => key.startsWith('quiz.')).sort());
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|BRL)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across the entire translation', (_label, pattern) => {
    const mismatches = expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(ptBr[key], pattern)),
    );
    expect(mismatches).toEqual([]);
  });

  it('preserves numeric values except the documented correction of LT-only phone guidance', () => {
    const mismatches = expectedKeys.filter((key) =>
      JSON.stringify(numbers(en[key])) !== JSON.stringify(numbers(ptBr[key])),
    );
    expect(mismatches.sort()).toEqual([...correctedPhoneKeys].sort());
    for (const key of correctedPhoneKeys) {
      expect(en[key]).toContain('+370');
      expect(ptBr[key]).toContain('código do país');
      expect(ptBr[key]).not.toContain('+370');
    }
  });

  it('loads Brazilian Portuguese consistently in browser, email and SSR dictionaries', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('pt-br', 'common.login')).toBe('Entrar');
      expect(translate('pt-br', 'companyNav.students')).toBe('Alunos');
      expect(translate('pt-br', 'chat.title')).toBe('Mensagens');
      expect(translate('pt-br', 'quiz.audience.solo.title')).toBe('Professor autônomo');
    }
    expect(emailText('pt-br', 'em.payReminderBodyOther', { student: 'João' }))
      .toBe('O aluno <strong>João</strong> ainda não pagou a aula.');
    expect(supportGeneralFollowUp('pt-br')).toBe('Em que mais posso ajudar?');
  });

  it('escapes user content and preserves payment and cancellation distinctions', () => {
    const html = tHtml('pt-br', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('pt-br', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Para cancelar, você precisa pagar a multa de €25.');
    expect(ptBr['cal.cancel']).toBe('Cancelar');
    expect(ptBr['common.delete']).toBe('Excluir');
    expect(ptBr['compStu.paid']).toBe('Pago');
    expect(ptBr['invoices.statusPaid']).toBe('Paga');
    expect(ptBr['settings.monthlyPlan']).toBe('Anual (€14,99/mês)');
  });

  it('restores explanatory messages using component context instead of terse source labels', () => {
    expect(ptBr['studentWait.tooltip']).toContain('lista de espera');
    expect(ptBr['compSet.payDesc']).toContain('diferença');
    expect(ptBr['stuSched.mustPayDesc']).toContain('não poderá agendar');
    expect(ptBr['compSch.confirmNoAvailability']).toContain('Deseja criar a aula mesmo assim?');
    expect(ptBr['dash.invoice']).toBe('Fatura');
    expect(ptBr['invoice.invoiceTitle']).toBe('Fatura');
    expect(ptBr['studentSettings.confirmDeleteMsg']).toContain('irreversível');
  });

  it('uses Brazilian formatting and metadata without publishing policies or blogs', () => {
    expect(LOCALE_FORMAT_TAGS['pt-br']).toBe('pt-BR');
    expect(getDateFnsLocale('pt-br').code).toBe('pt-BR');
    expect(getSeoMeta('pt-br', 'landing').title).toContain('professores particulares');
    expect(getSeoMeta('pt-br', 'pricing').title).toContain('Preços');
    expect(isTranslatedLocale('pt-br')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(ptBr[key]).toBe(en[key]);
    }
  });

  it('localizes public booking labels and dates without changing other locale fallbacks', () => {
    expect(Object.keys(CHROME['pt-br']).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('pt-br').book).toBe('Agendar uma aula');
    expect(chromeFor('pt-br').enquirySentTitle).toBe('Solicitação enviada');
    expect(formatShortDay('2026-08-22', 'pt-br')).toBe('22 de ago.');
    expect(chromeFor('fr')).toBe(CHROME.en);
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME['pt-br'][key]).not.toBe('');
      expect(tokens(CHROME['pt-br'][key], /\d+(?:[.,]\d+)?/g))
        .toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('uses Brazilian phone examples without restricting the interface to Brazilian numbers', () => {
    expect(getLocalizedPhonePlaceholder('pt-br')).toBe('+55 11 91234 5678');
    expect(formatLocalizedPhone('+55 (11) 91234-5678', 'pt-br')).toBe('+5511912345678');
    expect(validateLocalizedPhone('+55 (11) 91234-5678', 'pt-br')).toBe(true);
    expect(validateLocalizedPhone('+351912345678', 'pt-br')).toBe(true);
    expect(validateLocalizedPhone('11912345678', 'pt-br')).toBe(false);
  });
});
