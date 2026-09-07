import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { hu, huOverrides } from '../../src/lib/i18n/hu';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { renderShell } from '../../api/_lib/ssr-shell';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';
import { resolvePlatformTranslation } from '../../src/lib/i18n/platformOverrides';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
// Existing callers supply these values, but abbreviated English strings omit them.
// These deliberate repairs are reviewed in HUNGARIAN_LOCALIZATION_REVIEW.md.
const restoredParameters: Record<string, string[]> = {
  'cal.massCancelChars': ['{count}'],
  'compSch.seriesSummaryHtml': ['{fromDate}', '{timeRange}', '{weekday}'],
  'compStu.cancellationInfo': ['{hours}', '{percent}'],
  'companyWait.inQueueSince': ['{date}'],
  'em.afterLessonStudentPart': ['{student}'],
  'em.payReminderTiming': ['{hours}', '{timing}'],
  'invoice.emailNote': ['{days}'],
  'studentWait.addedOn': ['{date}'],
};
// Non-LT forms already use the international validator; LT-only guidance is wrong.
const correctedPhoneKeys = [
  'onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError',
  'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat',
];
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();
const numbers = (value: string) => tokens(value, /\d+(?:[.,]\d+)?/g).map((n) => n.replace(',', '.')).sort();

beforeAll(async () => { await loadLocaleDict('hu'); });

describe('Hungarian tutor and business localization', () => {
  it('covers every in-scope key, including all quiz branches, with no invented keys', () => {
    expect(Object.keys(huOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(hu).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !hu[key])).toEqual([]);
    expect(Object.keys(huOverrides).filter((key) => key.startsWith('quiz.')).sort())
      .toEqual(Object.keys(en).filter((key) => key.startsWith('quiz.')).sort());
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|BRL)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s, with documented source repairs', (label, pattern) => {
    expect(expectedKeys.filter((key) => {
      const expected = label === 'interpolation parameters' && restoredParameters[key]
        ? [...restoredParameters[key]].sort() : tokens(en[key], pattern);
      return JSON.stringify(expected) !== JSON.stringify(tokens(hu[key], pattern));
    })).toEqual([]);
  });

  it('preserves amounts and limits, using decimal commas and correcting LT-only phone hints', () => {
    expect(expectedKeys.filter((key) => JSON.stringify(numbers(en[key])) !== JSON.stringify(numbers(hu[key]))).sort())
      .toEqual([...correctedPhoneKeys].sort());
    for (const key of correctedPhoneKeys) {
      expect(en[key]).toContain('+370');
      expect(hu[key]).toContain('országhívóval');
      expect(hu[key]).not.toContain('+370');
    }
    expect(hu['pricing.studentFeeNote']).toContain('3,5% + €0,25');
  });

  it('loads Hungarian through browser, email, SSR, support and platform overrides', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('hu', 'common.login')).toBe('Bejelentkezés');
      expect(translate('hu', 'companyNav.students')).toBe('Diákok');
      expect(translate('hu', 'chat.title')).toBe('Üzenetek');
      expect(translate('hu', 'quiz.audience.solo.title')).toBe('Egyéni magántanár');
    }
    expect(emailText('hu', 'em.payReminderBodyOther', { student: 'Anna' }))
      .toBe('<strong>Anna</strong> diák még nem fizette ki az órát.');
    expect(supportGeneralFollowUp('hu')).toBe('Miben segíthetek még?');
    expect(resolvePlatformTranslation('schools', 'hu', 'nav.forSchools', hu['nav.forSchools'])).toBe('Iskolák');
  });

  it('renders restored deadlines, counts and dates instead of labels or date masks', () => {
    expect(t('hu', 'compStu.cancellationInfo', { hours: 24, percent: 50 }))
      .toBe('Lemondás: 24 órával előtte (50% díj)');
    expect(t('hu', 'cal.massCancelChars', { count: 7 })).toBe('7 karakter (legalább 5 szükséges)');
    expect(t('hu', 'studentWait.addedOn', { date: 'aug. 22.' })).toBe('Jelentkezés dátuma: aug. 22.');
    expect(t('hu', 'companyWait.inQueueSince', { date: '2026-08-22 14:30' })).toContain('2026-08-22 14:30');
    expect(emailText('hu', 'em.payReminderTiming', { hours: 24, timing: 'az óra előtt' })).toBe('24 óra – az óra előtt');
    expect(t('hu', 'invoice.emailNote', { days: 7 })).toContain('7 nap');
    expect(t('hu', 'compSch.seriesSummaryHtml', { fromDate: '2026-09-01', weekday: 'kedd', timeRange: '14:00–15:00' }))
      .toContain('2026-09-01. Nap: kedd; időpont: 14:00–15:00.');
    expect(emailText('hu', 'em.afterLessonStudentPart', { student: 'Anna' })).toBe('(diák: Anna)');
  });

  it('escapes user content and distinguishes cancellation, dismissal and invoice actions', () => {
    const html = tHtml('hu', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('hu', 'stuSess.penaltyPayNote', { amount: 25 })).toContain('€25 lemondási díjat');
    expect(hu['common.cancel']).toBe('Mégse');
    expect(hu['studentDash.cancelLesson']).toBe('Óra lemondása');
    expect(hu['invoices.markCancelled']).toBe('Érvénytelenítés');
    expect(hu['dash.package']).toBe('Óracsomag');
    expect(hu['dash.invoice']).toBe('Számla');
    expect(hu['invoice.invoiceTitle']).toBe('Számla');
    expect(hu['studentSettings.confirmDeleteMsg']).toContain('nem vonható vissza');
    expect(hu['stuSched.mustPayDesc']).toContain('nem foglalhatsz');
  });

  it('uses Hungarian dates and phone examples without restricting users to Hungarian numbers', () => {
    expect(LOCALE_FORMAT_TAGS.hu).toBe('hu-HU');
    expect(getDateFnsLocale('hu').code).toBe('hu');
    expect(formatShortDay('2026-08-22', 'hu')).toBe('aug. 22.');
    expect(getLocalizedPhonePlaceholder('hu')).toBe('+36 30 123 4567');
    expect(formatLocalizedPhone('+36 30 123 4567', 'hu')).toBe('+36301234567');
    expect(validateLocalizedPhone('+36 30 123 4567', 'hu')).toBe(true);
    expect(validateLocalizedPhone('+447700900123', 'hu')).toBe(true);
    expect(validateLocalizedPhone('06301234567', 'hu')).toBe(false);
  });

  it('localizes public booking and preserves deferred policy/module fallback', () => {
    expect(Object.keys(CHROME.hu).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('hu').book).toBe('Óra foglalása');
    expect(chromeFor('hu').enquirySentTitle).toBe('Érdeklődés elküldve');
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.hu[key]).not.toBe('');
      expect(numbers(CHROME.hu[key])).toEqual(numbers(CHROME.en[key]));
    }
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(hu[key]).toBe(en[key]);
    }
  });

  it('renders Hungarian metadata without publishing or adding search alternates', () => {
    const meta = getSeoMeta('hu', 'landing');
    expect(meta.title).toBe('Oktatásszervezés magántanároknak és vállalkozásoknak | Tutlio');
    expect(getSeoMeta('hu', 'pricing').title).toContain('árak');
    expect(isTranslatedLocale('hu')).toBe(false);
    const html = renderShell({ locale: 'hu', domain: 'com', path: '/', ...meta, body: '<h1>Magánórák</h1>' });
    expect(html).toContain('<html lang="hu" dir="ltr">');
    expect(html).toContain('content="index, follow, max-image-preview:large"');
    expect(html).toContain('>Iskoláknak</a>');
    expect(html).toContain('hreflang="hu"');
  });
});
