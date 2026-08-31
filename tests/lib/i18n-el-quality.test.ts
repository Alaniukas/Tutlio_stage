import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { el, elOverrides } from '../../src/lib/i18n/el';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale, buildLocalizedPath, getLocaleFromPathname } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();
// These source strings incorrectly prescribe Lithuania-only phone validation.
// Greek uses the existing international validator and Greek examples; amounts stay unchanged.
const localizedPhoneKeys = new Set([
  'compStu.phoneFormat', 'onboard.parentPhoneFormat', 'onboard.phoneFormatError',
  'register.phoneError', 'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat',
]);

beforeAll(async () => { await loadLocaleDict('el'); });

describe('Greek tutor and business localization', () => {
  it('explicitly covers the entire scope and every quiz key', () => {
    expect(Object.keys(elOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(el).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !el[key])).toEqual([]);
    expect(Object.keys(en).filter((key) => key.startsWith('quiz.') && !(key in elOverrides))).toEqual([]);
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s throughout the dictionary', (label, pattern) => {
    const mismatches = expectedKeys.filter((key) => {
      if (label === 'numeric values' && localizedPhoneKeys.has(key)) return false;
      return JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(el[key], pattern));
    });
    expect(mismatches).toEqual([]);
  });

  it('loads Greek in browser, transactional email and server-rendered copy', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('el', 'common.login')).toBe('Σύνδεση');
      expect(translate('el', 'companyNav.students')).toBe('Μαθητές');
      expect(translate('el', 'chat.title')).toBe('Μηνύματα');
      expect(translate('el', 'quiz.audience.solo.title')).toBe('Ανεξάρτητος καθηγητής');
    }
    expect(emailText('el', 'em.payReminderBodyOther', { student: 'Νίκος' }))
      .toBe('Ο μαθητής <strong>Νίκος</strong> δεν έχει πληρώσει ακόμη το μάθημα.');
    expect(supportGeneralFollowUp('el')).toBe('Σε τι άλλο μπορώ να σας βοηθήσω;');
    expect(emailText('el', 'em.disputeNote', { role: emailText('el', 'em.withTutor') }))
      .toBe('Αν δεν σας εξυπηρετεί αυτή η ώρα, επικοινωνήστε με τον καθηγητή μέσω της πλατφόρμας.');
  });

  it('preserves escaped user content and distinguishes payment, pay and cancellation', () => {
    const html = tHtml('el', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('el', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('Για να ακυρώσετε, πρέπει να πληρώσετε χρέωση ακύρωσης €25.');
    expect(el['common.delete']).toBe('Διαγραφή');
    expect(el['cal.cancel']).toBe('Ακύρωση');
    expect(el['stuSched.payBtn']).toBe('Πληρωμή');
    expect(el['compSet.payDesc']).toContain('διαφορά');
    expect(el['studentSettings.confirmDeleteMsg']).toContain('δεν μπορεί να αναιρεθεί');
    expect(el['compSch.confirmNoAvailability']).toContain('Να δημιουργηθεί το μάθημα');
    expect(el['stuSched.mustPayDesc']).toContain('δεν μπορείτε να κλείσετε');
    expect(el['dash.invoice']).toBe('Τιμολόγιο');
    expect(el['invoice.invoiceTitle']).toBe('Τιμολόγιο');
  });

  it('keeps el URLs, Greek formatting and unpublished status', () => {
    expect(LOCALE_FORMAT_TAGS.el).toBe('el-GR');
    expect(getDateFnsLocale('el').code).toBe('el');
    expect(localeDirection('el')).toBe('ltr');
    expect(buildLocalizedPath('/en/company/login', 'el', 'www.tutlio.com')).toBe('/el/company/login');
    expect(getLocaleFromPathname('/el/quiz')).toBe('el');
    expect(getSeoMeta('el', 'landing').title).toContain('ιδιαίτερων μαθημάτων');
    expect(getSeoMeta('el', 'pricing').title).toContain('Τιμές');
    expect(isTranslatedLocale('el')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(el[key]).toBe(en[key]);
    }
  });

  it('localizes the complete public booking interface and Greek date labels', () => {
    expect(Object.keys(CHROME.el).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('el').book).toBe('Κράτηση μαθήματος');
    expect(chromeFor('el').enquirySentTitle).toBe('Το αίτημα στάλθηκε');
    expect(formatShortDay('2026-08-22', 'el')).toContain('Αυγ');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
  });

  it('uses Greek phone examples without forcing Greek users into Lithuanian formatting', () => {
    expect(getLocalizedPhonePlaceholder('el')).toBe('+30 691 234 5678');
    expect(formatLocalizedPhone('+30 691 234 5678', 'el')).toBe('+306912345678');
    expect(validateLocalizedPhone('+30 691 234 5678', 'el')).toBe(true);
    expect(validateLocalizedPhone('6912345678', 'el')).toBe(false);
    for (const key of localizedPhoneKeys) {
      expect(el[key]).not.toContain('+370');
    }
    expect(formatLocalizedPhone('861234567', 'lt')).toBe('+370 61234567');
  });
});
