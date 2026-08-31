import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { pt, ptOverrides } from '../../src/lib/i18n/pt';
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
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
// Parameters supplied by existing callers but omitted from abbreviated English source strings.
const restoredSourceParameters: Record<string, string[]> = {
  'cal.massCancelChars': ['{count}'],
  'compSch.seriesSummaryHtml': ['{fromDate}', '{timeRange}', '{weekday}'],
  'compStu.cancellationInfo': ['{hours}', '{percent}'],
  'companyWait.inQueueSince': ['{date}'],
  'em.payReminderTiming': ['{hours}', '{timing}'],
  'invoice.emailNote': ['{days}'],
  'studentWait.addedOn': ['{date}'],
};
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();
// Portuguese decimal commas change presentation, never the amount.
const numbers = (value: string) => tokens(value, /\d+(?:[.,]\d+)?/g).map((token) => token.replace(',', '.')).sort();

// The source's LT-only phone instructions contradict the existing non-LT validator.
// Correcting that guidance does not change validation, money or product limits.
const correctedPhoneKeys = [
  'onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError',
  'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat',
];

beforeAll(async () => { await loadLocaleDict('pt'); });

describe('European Portuguese tutor and business localization', () => {
  it('explicitly covers every in-scope source key, including the entire onboarding quiz', () => {
    expect(Object.keys(ptOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !pt[key])).toEqual([]);
    expect(Object.keys(ptOverrides).filter((key) => key.startsWith('quiz.')).sort())
      .toEqual(Object.keys(en).filter((key) => key.startsWith('quiz.')).sort());
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|BRL)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across the entire translation', (label, pattern) => {
    const mismatches = expectedKeys.filter((key) =>
      JSON.stringify(label === 'interpolation parameters' && restoredSourceParameters[key]
        ? [...restoredSourceParameters[key]].sort() : tokens(en[key], pattern)) !== JSON.stringify(tokens(pt[key], pattern)),
    );
    expect(mismatches).toEqual([]);
  });

  it('preserves numeric values except the documented correction of LT-only phone guidance', () => {
    const mismatches = expectedKeys.filter((key) =>
      JSON.stringify(numbers(en[key])) !== JSON.stringify(numbers(pt[key])),
    );
    expect(mismatches.sort()).toEqual([...correctedPhoneKeys].sort());
    for (const key of correctedPhoneKeys) {
      expect(en[key]).toContain('+370');
      expect(pt[key]).toContain('código do país');
      expect(pt[key]).not.toContain('+370');
    }
  });

  it('loads European Portuguese consistently in browser, email and SSR dictionaries', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('pt', 'common.login')).toBe('Entrar');
      expect(translate('pt', 'companyNav.students')).toBe('Alunos');
      expect(translate('pt', 'chat.title')).toBe('Mensagens');
      expect(translate('pt', 'quiz.audience.solo.title')).toBe('Explicador independente');
    }
    expect(emailText('pt', 'em.payReminderBodyOther', { student: 'João' }))
      .toBe('O aluno <strong>João</strong> ainda não pagou a aula.');
    expect(supportGeneralFollowUp('pt')).toBe('Em que mais posso ajudar?');
  });

  it('escapes user content and preserves payment and cancellation distinctions', () => {
    const html = tHtml('pt', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('pt', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Para cancelar, precisa de pagar a penalização de €25.');
    expect(pt['cal.cancel']).toBe('Cancelar');
    expect(pt['common.delete']).toBe('Eliminar');
    expect(pt['compStu.paid']).toBe('Pago');
    expect(pt['invoices.statusPaid']).toBe('Paga');
    expect(pt['settings.monthlyPlan']).toBe('Anual (€14,99/mês)');
  });

  it('restores explanatory messages using component context instead of terse source labels', () => {
    expect(pt['studentWait.tooltip']).toContain('lista de espera');
    expect(pt['compSet.payDesc']).toContain('diferença');
    expect(pt['stuSched.mustPayDesc']).toContain('não poderá agendar');
    expect(pt['compSch.confirmNoAvailability']).toContain('Pretende criar a aula mesmo assim?');
    expect(pt['dash.invoice']).toBe('Fatura');
    expect(pt['invoice.invoiceTitle']).toBe('Fatura');
    expect(pt['studentSettings.confirmDeleteMsg']).toContain('irreversível');
  });

  it('renders dates, deadlines and cancellation conditions supplied by the existing callers', () => {
    expect(t('pt', 'companyWait.inQueueSince', { date: '31/08/2026 10:00' }))
      .toBe('Na lista de espera desde 31/08/2026 10:00');
    expect(t('pt', 'studentWait.addedOn', { date: '31 de ago.' })).toBe('Adicionado em 31 de ago.');
    expect(t('pt', 'invoice.emailNote', { days: 7 })).toContain('7 dias');
    expect(t('pt', 'cal.massCancelChars', { count: 3 })).toBe('3 caracteres (mínimo 5)');
    expect(t('pt', 'compStu.cancellationInfo', { hours: 24, percent: 50 }))
      .toBe('Cancelamento: 24 h antes (penalização de 50 %)');
    const series = t('pt', 'compSch.seriesSummaryHtml', { fromDate: '31/08/2026', weekday: 'segunda-feira', timeRange: '10:00–11:00' });
    expect(series).toContain('31/08/2026');
    expect(series).toContain('segunda-feira');
    expect(series).toContain('10:00–11:00');
    expect(series).not.toMatch(/\{\w+\}/);
    expect(emailText('pt', 'em.payReminderTiming', { hours: 24, timing: emailText('pt', 'em.payReminderBefore') }))
      .toBe('24 h antes da aula');
    expect(emailText('pt', 'em.payReminderTiming', { hours: 2, timing: emailText('pt', 'em.payReminderAfter') }))
      .toBe('2 h depois da aula');
  });

  it('uses European Portuguese terminology and keeps signatures distinct from subscriptions', () => {
    const brazilianOnly = /\b(?:você|vocês|usuários?|celulares?|arquivos?|cadastro|cadastrar|tela|telas|autônom[oa]s?|gerenciar|conosco|senha|senhas)\b/i;
    expect(expectedKeys.filter((key) => brazilianOnly.test(pt[key]))).toEqual([]);
    expect(pt['settings.manageSubscription']).toBe('Gira a sua subscrição');
    expect(pt['em.entWelcomeNext']).toContain('subscrição');
    expect(pt['compStu.filterContractPending']).toBe('A aguardar assinatura');
    expect(t('pt', 'cal.studentGrade', { name: 'Ana', grade: 8 })).toBe('Ana (Ano escolar do aluno: 8)');
    expect(pt['landing.v2.wlSubjMath']).toBe('Matemática · 10.º ano');
    expect(pt['auth.newPassword']).toBe('Nova palavra-passe');
    expect(pt['feature.calendar.faq.mobileCalendarA']).toContain('aplicação web progressiva');
  });

  it('uses Portuguese formatting and metadata without publishing policies or blogs', () => {
    expect(LOCALE_FORMAT_TAGS['pt']).toBe('pt-PT');
    expect(getDateFnsLocale('pt').code).toBe('pt');
    expect(getSeoMeta('pt', 'landing').title).toContain('explicadores');
    expect(getSeoMeta('pt', 'pricing').title).toContain('Preços');
    expect(isTranslatedLocale('pt')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(pt[key]).toBe(en[key]);
    }
  });

  it('localizes public booking labels and dates without changing other locale fallbacks', () => {
    expect(Object.keys(CHROME['pt']).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('pt').book).toBe('Marcar uma aula');
    expect(chromeFor('pt').enquirySentTitle).toBe('Pedido enviado');
    expect(formatShortDay('2026-08-22', 'pt')).toBe('22/08');
    expect(chromeFor('fr')).toBe(CHROME.en);
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME['pt'][key]).not.toBe('');
      expect(tokens(CHROME['pt'][key], /\d+(?:[.,]\d+)?/g))
        .toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('uses Portuguese phone examples without restricting the interface to Portuguese numbers', () => {
    expect(getLocalizedPhonePlaceholder('pt')).toBe('+351 912 345 678');
    expect(formatLocalizedPhone('+351 912 345 678', 'pt')).toBe('+351912345678');
    expect(validateLocalizedPhone('+351 912 345 678', 'pt')).toBe(true);
    expect(validateLocalizedPhone('+44 7700 900000', 'pt')).toBe(true);
    expect(validateLocalizedPhone('912345678', 'pt')).toBe(false);
  });
});
