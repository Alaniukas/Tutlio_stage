import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { esMx, esMxOverrides } from '../../src/lib/i18n/es-mx';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

// Source-only LT restrictions contradict the existing non-LT international validator.
// These translations deliberately remove those restrictions, not prices or limits.
const correctedPhoneKeys = [
  'onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError',
  'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat',
];

beforeAll(async () => {
  await loadLocaleDict('es-mx');
});

describe('Mexican Spanish tutor and business localization', () => {
  it('covers every in-scope source key, including the complete onboarding quiz', () => {
    expect(Object.keys(esMxOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(esMx).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !esMx[key])).toEqual([]);
    expect(Object.keys(esMxOverrides).filter((key) => key.startsWith('quiz.')).sort())
      .toEqual(Object.keys(en).filter((key) => key.startsWith('quiz.')).sort());
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|MXN)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across the entire translation', (_label, pattern) => {
    const mismatches = expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(esMx[key], pattern)),
    );
    expect(mismatches).toEqual([]);
  });

  it('preserves numeric values except the documented LT-only phone guidance', () => {
    const numericMismatches = expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], /\d+(?:[.,]\d+)?/g)) !== JSON.stringify(tokens(esMx[key], /\d+(?:[.,]\d+)?/g)),
    );
    expect(numericMismatches.sort()).toEqual([...correctedPhoneKeys].sort());
    for (const key of correctedPhoneKeys) {
      expect(en[key]).toContain('+370');
      expect(esMx[key]).toContain('código de país');
      expect(esMx[key]).not.toContain('+370');
    }
  });

  it('loads Mexican Spanish consistently in browser, email and SSR dictionaries', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('es-mx', 'common.login')).toBe('Iniciar sesión');
      expect(translate('es-mx', 'companyNav.students')).toBe('Alumnos');
      expect(translate('es-mx', 'chat.title')).toBe('Mensajes');
      expect(translate('es-mx', 'quiz.audience.solo.title')).toBe('Profesor particular independiente');
    }
    expect(emailText('es-mx', 'em.payReminderBodyOther', { student: 'María' }))
      .toBe('El alumno <strong>María</strong> aún no ha pagado la clase.');
    expect(supportGeneralFollowUp('es-mx')).toBe('¿En qué más puedo ayudarle?');
  });

  it('escapes user content and preserves payment and cancellation distinctions', () => {
    const html = tHtml('es-mx', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('es-mx', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Para cancelar, debe pagar el cargo de penalización de €25.');
    expect(esMx['settings.monthlyPlan']).toBe('Anual (€14.99/mes)');
    expect(esMx['cal.cancel']).toBe('Cancelar');
    expect(esMx['common.delete']).toBe('Eliminar');
    expect(esMx['compStu.paid']).toBe('Pagado');
    expect(esMx['invoices.statusPaid']).toBe('Pagada');
  });

  it('uses regional terminology and meaningful explanatory text without mojibake', () => {
    expect(Object.entries(esMxOverrides).filter(([, value]) => /Ã|Â|�|\basignaturas?\b|\bcostes?\b/.test(value))).toEqual([]);
    expect(esMx['compTut.teachingNotes']).toBe('Materias y grados');
    expect(esMx['onboard.parent']).toContain('tutor legal');
    expect(esMx['studentWait.tooltip']).toContain('lista de espera');
    expect(esMx['compSet.payDesc']).toContain('diferencia');
    expect(esMx['stuSched.mustPayDesc']).toContain('no podrá reservar');
    expect(esMx['compSch.confirmNoAvailability']).toContain('¿Desea crear la clase de todos modos?');
    expect(esMx['dash.invoice']).toBe('Factura');
    expect(esMx['invoice.invoiceTitle']).toBe('Factura');
  });

  it('uses Mexican formatting and metadata without publishing unreviewed policies or blogs', () => {
    expect(LOCALE_FORMAT_TAGS['es-mx']).toBe('es-MX');
    expect(getDateFnsLocale('es-mx').code).toBe('es');
    expect(getSeoMeta('es-mx', 'landing').title).toBe('Software para profesores particulares y escuelas | Tutlio');
    expect(getSeoMeta('es-mx', 'pricing').title).toContain('Precios');
    expect(isTranslatedLocale('es-mx')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(esMx[key]).toBe(en[key]);
    }
  });

  it('localizes public booking labels and dates while preserving other locale fallbacks', () => {
    expect(Object.keys(CHROME['es-mx']).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('es-mx').book).toBe('Reservar una clase');
    expect(chromeFor('es-mx').enquirySentTitle).toBe('Solicitud enviada');
    expect(formatShortDay('2026-08-22', 'es-mx')).toBe('22 ago');
    expect(chromeFor('es')).toBe(CHROME.en);
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME['es-mx'][key]).not.toBe('');
      expect(tokens(CHROME['es-mx'][key], /\d+(?:[.,]\d+)?/g))
        .toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });
});
