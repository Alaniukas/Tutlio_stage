import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { hr, hrOverrides } from '../../src/lib/i18n/hr';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { renderShell } from '../../api/_lib/ssr-shell';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => { await loadLocaleDict('hr'); });

describe('Croatian tutor and business localization', () => {
  it('covers the complete tutor/business scope, including all quiz branches', () => {
    expect(Object.keys(hrOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(hr).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !hr[key])).toEqual([]);
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across the translation', (_label, pattern) => {
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(hr[key], pattern)),
    )).toEqual([]);
  });

  it('loads Croatian through browser, email, SSR and support paths', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('hr', 'common.login')).toBe('Prijavi se');
      expect(translate('hr', 'companyNav.students')).toBe('Učenici');
      expect(translate('hr', 'chat.title')).toBe('Poruke');
      expect(translate('hr', 'quiz.audience.solo.title')).toBe('Samostalni instruktor');
    }
    expect(emailText('hr', 'em.payReminderBodyOther', { student: 'Ivan' }))
      .toBe('Učenik <strong>Ivan</strong> još nije platio sat.');
    expect(supportGeneralFollowUp('hr')).toBe('Kako ti još mogu pomoći?');
  });

  it('escapes user content and distinguishes payment from cancellation actions', () => {
    const html = tHtml('hr', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('hr', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Za otkazivanje moraš platiti naknadu od €25.');
    expect(hr['common.cancel']).toBe('Odustani');
    expect(hr['studentDash.cancelLesson']).toBe('Otkaži sat');
    expect(hr['invoices.markCancelled']).toBe('Poništi račun');
    expect(hr['stuSched.payBtn']).toBe('Plati');
    expect(hr['studentDash.pay']).toBe('Plati');
    expect(hr['subscribe.payBtn']).toBe('Plati');
    expect(hr['studentSettings.confirmDeleteMsg']).toContain('ne može poništiti');
  });

  it('provides meaningful help where English contains abbreviated source copy', () => {
    expect(hr['compSet.payDesc']).toContain('razlika');
    expect(hr['stuSched.mustPayDesc']).toContain('ne možeš rezervirati');
    expect(hr['studentWait.tooltip']).toContain('obavijest e-poštom');
    expect(hr['compSch.confirmNoAvailability']).toContain('Ipak izraditi sat?');
    expect(hr['dash.invoice']).toBe('Račun');
    expect(hr['invoice.invoiceTitle']).toBe('Račun');
  });

  it('formats Croatian dates and phone examples without restricting users to Croatian numbers', () => {
    expect(LOCALE_FORMAT_TAGS.hr).toBe('hr-HR');
    expect(getDateFnsLocale('hr').code).toBe('hr');
    expect(formatShortDay('2026-08-22', 'hr')).toBe(
      new Date('2026-08-22T12:00:00').toLocaleDateString('hr-HR', { month: 'short', day: 'numeric' }),
    );
    expect(getLocalizedPhonePlaceholder('hr')).toBe('+385 91 123 4567');
    expect(formatLocalizedPhone('+385 91 123 4567', 'hr')).toBe('+385911234567');
    expect(validateLocalizedPhone('+385 91 123 4567', 'hr')).toBe(true);
    expect(validateLocalizedPhone('+447700900123', 'hr')).toBe(true);
    expect(validateLocalizedPhone('0911234567', 'hr')).toBe(false);
  });

  it('localizes public booking and metadata while retaining unpublished status and deferred fallback', () => {
    expect(Object.keys(CHROME.hr).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('hr').book).toBe('Rezerviraj sat');
    expect(chromeFor('hr').enquirySentTitle).toBe('Upit je poslan');
    expect(getSeoMeta('hr', 'landing').title).toBe('Platforma za upravljanje instrukcijama i centrima | Tutlio');
    expect(getSeoMeta('hr', 'pricing').title).toContain('Cijene');
    expect(isTranslatedLocale('hr')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(hr[key]).toBe(en[key]);
    }
  });

  it('renders Croatian marketing with noindex and excludes it from published alternates', () => {
    const meta = getSeoMeta('hr', 'landing');
    const html = renderShell({ locale: 'hr', domain: 'com', path: '/', ...meta, body: '<h1>Instrukcije</h1>' });
    expect(html).toContain('<html lang="hr" dir="ltr">');
    expect(html).toContain('content="noindex, follow"');
    expect(html).toContain('>Za škole</a>');
    expect(html).not.toContain('hreflang="hr"');
  });
});
