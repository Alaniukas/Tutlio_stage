import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { hi, hiOverrides } from '../../src/lib/i18n/hi';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => { await loadLocaleDict('hi'); });

describe('Hindi tutor and business localization', () => {
  it('explicitly covers every in-scope key and leaves deferred products on English', () => {
    expect(Object.keys(hiOverrides).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !hi[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(hi[key]).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s throughout the dictionary', (_label, pattern) => {
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(hi[key], pattern)),
    )).toEqual([]);
  });

  it('loads Hindi in browser, email and SSR without losing it to platform fallbacks', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('hi', 'common.login')).toBe('लॉग इन करें');
      expect(translate('hi', 'quiz.audience.solo.title')).toBe('व्यक्तिगत ट्यूटर');
      expect(translate('hi', 'companyNav.students')).toBe('विद्यार्थी');
    }
    expect(t('hi', 'nav.forSchools', undefined, 'schools')).toBe(hi['nav.forSchools']);
    expect(t('hi', 'nav.platform', undefined, 'teachers')).toBe('प्लेटफ़ॉर्म');
    expect(supportGeneralFollowUp('hi')).toBe('मैं आपकी और क्या मदद कर सकता हूँ?');
  });

  it('keeps payment actions distinct and escapes user-controlled HTML', () => {
    const html = tHtml('hi', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('hi', 'stuSess.penaltyPayNote', { amount: 25 }))
      .toBe('रद्द करने के लिए आपको €25 का जुर्माना देना होगा।');
    expect(hi['cal.cancel']).toBe('रद्द करें');
    expect(hi['common.delete']).toBe('मिटाएँ');
    expect(hi['dash.invoice']).toBe('इनवॉइस');
    expect(hi['invoice.invoiceTitle']).toBe('इनवॉइस');
    expect(hi['stuSched.mustPayDesc']).toContain('नई क्लास बुक नहीं कर सकते');
    expect(hi['studentSettings.confirmDeleteMsg']).toContain('वापस नहीं ली जा सकती');
  });

  it('composes email fragments into Hindi for both student and payer recipients', () => {
    expect(emailText('hi', 'em.afterLessonBody', { tutor: 'Alex', studentPart: '' }))
      .toBe('ट्यूटर <strong>Alex</strong> के साथ क्लास पूरी हो गई है।');
    expect(emailText('hi', 'em.afterLessonBody', { tutor: 'Alex', studentPart: emailText('hi', 'em.afterLessonStudentPart', { student: 'Sam' }) }))
      .toBe('ट्यूटर <strong>Alex</strong> के साथ विद्यार्थी Sam की क्लास पूरी हो गई है।');
    expect(emailText('hi', 'em.packageReqBody', { tutor: 'Alex', studentPart: emailText('hi', 'em.packageReqStudentPart', { student: 'Sam' }) }))
      .toBe('ट्यूटर <strong>Alex</strong> विद्यार्थी Sam के लिए क्लास पैकेज ऑफ़र कर रहे हैं।');
    expect(emailText('hi', 'em.disputeNote', { role: emailText('hi', 'em.withTutor') }))
      .toContain('ट्यूटर से संपर्क करें');
    expect(emailText('hi', 'em.payReminderBodyOther', { student: 'Sam' }))
      .toBe('विद्यार्थी <strong>Sam</strong> ने अभी तक क्लास का भुगतान नहीं किया है।');
  });

  it('uses Hindi formatting and public copy while retaining the publication gate', () => {
    expect(LOCALE_FORMAT_TAGS.hi).toBe('hi-IN');
    expect(localeDirection('hi')).toBe('ltr');
    expect(getDateFnsLocale('hi').code).toBe('hi');
    expect(formatShortDay('2026-08-22', 'hi')).toBe('22 अग॰');
    expect(getSeoMeta('hi', 'landing').title).toContain('ट्यूशन संस्थानों');
    expect(getSeoMeta('hi', 'pricing').title).toContain('कीमतें');
    expect(isTranslatedLocale('hi')).toBe(false);
    expect(Object.keys(CHROME.hi).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('hi').book).toBe('क्लास बुक करें');
    expect(chromeFor('hi').enquirySentTitle).toBe('अनुरोध भेज दिया गया');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.hi[key]).toMatch(/[\u0900-\u097f]/);
      expect(tokens(CHROME.hi[key], /\d+/g)).toEqual(tokens(CHROME.en[key], /\d+/g));
    }
  });
});
