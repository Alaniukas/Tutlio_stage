import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { id as indonesian, idOverrides } from '../../src/lib/i18n/id';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, validateLocalizedPhone, getLocalizedPhonePlaceholder } from '../../src/lib/utils';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

// English contains truncated labels/date-format literals at these call sites.
// Restore only the arguments the existing components already supply; do not
// silently exempt other keys or relax HTML/numeric/link integrity checks.
const restoredSourceParameters: Record<string, string[]> = {
  'cal.massCancelChars': ['{count}'], // Calendar.tsx
  'compSch.seriesSummaryHtml': ['{fromDate}', '{timeRange}', '{weekday}'], // CompanyTvarkarastis.tsx
  'companyWait.inQueueSince': ['{date}'], // CompanyOrgWaitlistPanel.tsx
  'invoice.emailNote': ['{days}'], // SendInvoiceModal.tsx
  'studentWait.addedOn': ['{date}'], // StudentWaitlist.tsx
};

beforeAll(async () => { await loadLocaleDict('id'); });

describe('Indonesian tutor and business localization', () => {
  it('explicitly covers the tutor/business scope and retains intentional fallback sections', () => {
    expect(Object.keys(idOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(indonesian).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !indonesian[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(indonesian[key]).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s throughout the translated dictionary', (label, pattern) => {
    const mismatches = expectedKeys.filter((key) => {
      const expected = label === 'interpolation parameters' && restoredSourceParameters[key]
        ? [...restoredSourceParameters[key]].sort()
        : tokens(en[key], pattern);
      return JSON.stringify(expected) !== JSON.stringify(tokens(indonesian[key], pattern));
    });
    expect(mismatches).toEqual([]);
  });

  it('uses Indonesian in browser, transactional email and SSR dictionaries', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('id', 'common.login')).toBe('Masuk');
      expect(translate('id', 'companyNav.students')).toBe('Siswa');
      expect(translate('id', 'chat.title')).toBe('Pesan');
      expect(translate('id', 'quiz.audience.solo.title')).toBe('Tutor mandiri');
    }
    expect(emailText('id', 'em.payReminderBodyOther', { student: 'Ayu' }))
      .toBe('Siswa <strong>Ayu</strong> belum membayar sesi les.');
    expect(supportGeneralFollowUp('id')).toBe('Ada hal lain yang bisa saya bantu?');
  });

  it('keeps interpolated user input safe and cancellation obligations explicit', () => {
    const html = tHtml('id', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('id', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Untuk membatalkan, Anda harus membayar denda €25.');
    expect(indonesian['studentSettings.confirmDeleteMsg']).toContain('tidak dapat dibatalkan');
    expect(indonesian['stuSched.mustPayDesc']).toContain('tidak dapat memesan');
    expect(indonesian['compTut.tutorPricing']).toBe('Harga les tutor per mata pelajaran');
    expect(indonesian['compSet.payDesc']).toContain('selisih harga sesi les dan honor tutor');
    expect(indonesian['dash.invoice']).toBe('Faktur');
    expect(indonesian['invoice.invoiceTitle']).toBe('Faktur');
  });

  it('renders existing dates, deadlines and series information instead of source format stubs', () => {
    expect(t('id', 'companyWait.inQueueSince', { date: '2026-08-31 10:00' }))
      .toBe('Dalam antrean sejak 2026-08-31 10:00');
    expect(t('id', 'studentWait.addedOn', { date: '31 Agu' })).toBe('Ditambahkan pada 31 Agu');
    expect(t('id', 'invoice.emailNote', { days: 7 })).toContain('7 hari');
    expect(t('id', 'cal.massCancelChars', { count: 3 })).toBe('3 karakter (minimal 5).');
    const series = t('id', 'compSch.seriesSummaryHtml', { fromDate: '2026-08-31', weekday: 'Senin', timeRange: '10:00–11:00' });
    expect(series).toContain('2026-08-31');
    expect(series).toContain('Senin');
    expect(series).toContain('10:00–11:00');
    expect(series).not.toMatch(/\{\w+\}/);
  });

  it('uses Indonesian date formatting and metadata without enabling search publication', () => {
    expect(LOCALE_FORMAT_TAGS.id).toBe('id-ID');
    expect(getDateFnsLocale('id').code).toBe('id');
    expect(getSeoMeta('id', 'landing').title).toBe('Aplikasi Manajemen Tutor dan Bimbel | Tutlio');
    expect(getSeoMeta('id', 'pricing').title).toContain('Harga');
    expect(isTranslatedLocale('id')).toBe(false);
    expect(formatShortDay('2026-08-22', 'id')).toBe('22 Agu');
  });

  it('localizes every public booking label without changing other locale fallbacks', () => {
    expect(Object.keys(CHROME.id).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('id').book).toBe('Pesan sesi les');
    expect(chromeFor('id').enquirySentTitle).toBe('Permintaan terkirim');
    expect(chromeFor('id').trustLine).toContain('Tanpa komitmen');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    expect(chromeFor('fr')).toBe(CHROME.en);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.id[key]).not.toBe('');
      expect(tokens(CHROME.id[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('accepts Indonesian international phone numbers without constraining users to Indonesia', () => {
    expect(getLocalizedPhonePlaceholder('id')).toBe('+62 812 3456 7890');
    expect(formatLocalizedPhone('+62 812 3456 7890', 'id')).toBe('+6281234567890');
    expect(validateLocalizedPhone('+62 812 3456 7890', 'id')).toBe(true);
    expect(validateLocalizedPhone('+44 7700 900000', 'id')).toBe(true);
    expect(validateLocalizedPhone('081234567890', 'id')).toBe(false);
  });
});
