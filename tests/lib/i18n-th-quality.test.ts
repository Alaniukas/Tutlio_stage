import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import FaqSection from '../../src/components/landing/v2/FaqSection';
import { format, parse } from 'date-fns';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { th, thOverrides } from '../../src/lib/i18n/th';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { I18nContext, getDateFnsLocale, buildLocalizedPath, getLocaleFromPathname } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, validateLocalizedPhone, getLocalizedPhonePlaceholder } from '../../src/lib/utils';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
// Existing international validation accepts +66. Correct these LT-only source examples.
const phoneCorrections = new Set(['onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError', 'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat']);
// Abbreviated source messages omit arguments already supplied by their callers.
const restoredArguments: Record<string, string[]> = {
};
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => { await loadLocaleDict('th'); });

describe('Thai tutor and business localization', () => {
  it('covers the complete scope, including every quiz key, and retains deferred English copy', () => {
    expect(Object.keys(thOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !th[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) expect(th[key]).toBe(en[key]);
    expect(expectedKeys.filter((key) => key.startsWith('quiz.') && /[A-Za-z]/.test(en[key]) && !/[\u0e00-\u0e7f]/.test(th[key])).sort()).toEqual([
      'quiz.info.story.solo.name1', 'quiz.info.story.solo.name2',
      'quiz.info.story.company.customerName', 'quiz.offer.testimonial.company.name1',
      'quiz.info.story.school.customerName', 'quiz.offer.testimonial.school.name1',
      'quiz.email.placeholder', 'quiz.offer.testimonial.solo.name3', 'quiz.offer.testimonial.solo.name4',
    ].sort());
  });

  it.each([
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|THB)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across every scoped key', (_label, pattern) => {
    expect(expectedKeys.filter((key) => JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(th[key], pattern)))).toEqual([]);
  });

  it('preserves placeholders, numeric limits and prices, with only documented corrections', () => {
    const parameters = /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g;
    expect(expectedKeys.filter((key) => JSON.stringify([...tokens(en[key], parameters), ...(restoredArguments[key] ?? [])].sort()) !== JSON.stringify(tokens(th[key], parameters)))).toEqual([]);
    const numbers = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter((key) => !phoneCorrections.has(key) && JSON.stringify(tokens(en[key], numbers)) !== JSON.stringify(tokens(th[key], numbers)))).toEqual([]);
    for (const key of phoneCorrections) {
      expect(th[key]).toContain('+66 81 234 5678');
      expect(th[key]).not.toContain('+370');
    }
    expect(t('th', 'invoice.emailNote', { days: 7 })).toContain('7 วัน');
    expect(t('th', 'studentWait.addedOn', { date: '31 ส.ค.' })).toBe('เพิ่มเมื่อ 31 ส.ค.');
    expect(t('th', 'cal.massCancelChars', { count: 4 })).toContain('4 ตัวอักษร');
    expect(t('th', 'compSch.seriesSummaryHtml', { fromDate: '2026-09-01', weekday: 'อังคาร', timeRange: '14:30–15:30' })).toBe('ตั้งแต่ 2026-09-01 คาบถัดไปในชุดนี้จะเป็นทุกอังคาร เวลา 14:30–15:30');
  });

  it('loads Thai consistently in UI, email, SSR and support, with safe HTML interpolation', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('th', 'common.login')).toBe('เข้าสู่ระบบ');
      expect(translate('th', 'quiz.audience.solo.title')).toBe('ติวเตอร์อิสระ');
      expect(translate('th', 'companyNav.students')).toBe('นักเรียน');
    }
    expect(supportGeneralFollowUp('th')).toBe('มีเรื่องอื่นที่ให้ช่วยอีกไหม?');
    expect(t('th', 'em.payReminderTiming', { hours: 24, timing: t('th', 'em.payReminderBefore') })).toBe('24 ชั่วโมงก่อนคาบเรียน');
    expect(t('th', 'em.payReminderTiming', { hours: 2, timing: t('th', 'em.payReminderAfter') })).toBe('2 ชั่วโมงหลังคาบเรียน');
    expect(th['studentSettings.confirmDeleteMsg']).toContain('ย้อนกลับไม่ได้');
    expect(th['stuSched.mustPayDesc']).toContain('จองคาบใหม่หรือเข้ารายชื่อรอเรียนไม่ได้');
    expect(th['compSet.payDesc']).toContain('ราคาคาบเรียนลบค่าตอบแทนติวเตอร์');
    expect(th['lessonSet.reminderStudentHint']).toContain('ชั่วโมง');
    expect(th['lessonSet.reminderStudentHint']).not.toContain('นาที');
    expect(th['parent.freeWith']).toBe('เวลาว่างกับ {tutor}');
    expect(th['status.complimentary']).toBe('ฟรี');
    const html = tHtml('th', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
  });

  it('uses Thai day and month labels while preserving Gregorian booking years', () => {
    const locale = getDateFnsLocale('th');
    const date = new Date(2026, 7, 31, 14, 30);
    expect(locale?.code).toBe('th');
    expect(format(date, 'EEEE MMMM yyyy', { locale })).toBe('จันทร์ สิงหาคม 2026');
    const intl = new Intl.DateTimeFormat(LOCALE_FORMAT_TAGS.th, { year: 'numeric', month: 'long', day: 'numeric' });
    expect(intl.resolvedOptions().calendar).toBe('gregory');
    expect(intl.format(date)).toContain('2026');
    expect(intl.format(date)).not.toContain('2569');
    for (let month = 0; month < 12; month++) {
      const fixture = new Date(2026, month, 12, 14, 30);
      for (const pattern of ['PP', 'MMMM d, yyyy', 'MMM d, yyyy']) {
        const value = format(fixture, pattern, { locale });
        expect(format(parse(value, pattern, date, { locale }), pattern, { locale })).toBe(value);
      }
    }
    expect(formatShortDay('2026-08-22', 'th')).toBe('22 ส.ค.');
    const faq = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(I18nContext.Provider, { value: {
        locale: 'th', setLocale: () => {}, dateFnsLocale: locale,
        t: (key, params) => t('th', key, params),
        tHtml: (key, params) => tHtml('th', key, params),
      } }, createElement(FaqSection))));
    expect(faq).toContain('กันยายน 2026');
    expect(faq).not.toContain('2569');
  });

  it('supports Thai phone examples without restricting other international numbers', () => {
    expect(formatLocalizedPhone('+66 81 234 5678', 'th')).toBe('+66812345678');
    expect(validateLocalizedPhone('+66812345678', 'th')).toBe(true);
    expect(validateLocalizedPhone('0812345678', 'th')).toBe(false);
    expect(validateLocalizedPhone('+447700900123', 'th')).toBe(true);
    expect(getLocalizedPhonePlaceholder('th')).toBe('+66 81 234 5678');
    expect(validateLocalizedPhone('+66812345678', 'lt')).toBe(false);
    expect(validateLocalizedPhone('+37061234567', 'lt')).toBe(true);
  });

  it('supports public booking and locale routes without publishing Thai for search indexing', () => {
    expect(LOCALE_FORMAT_TAGS.th).toBe('th-TH-u-ca-gregory');
    expect(htmlLanguageCode('th')).toBe('th');
    expect(localeDirection('th')).toBe('ltr');
    expect(isTranslatedLocale('th')).toBe(false);
    expect(buildLocalizedPath('/pricing', 'th', 'tutlio.com')).toBe('/th/pricing');
    expect(getLocaleFromPathname('/th/pricing')).toBe('th');
    expect(getSeoMeta('th', 'landing').title).toContain('ติวเตอร์');
    expect(getSeoMeta('th', 'pricing').title).toContain('ราคา');
    expect(Object.keys(CHROME.th).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('th').book).toBe('จองคาบเรียน');
    expect(chromeFor('th').enquirySentTitle).toBe('ส่งคำขอแล้ว');
    expect(chromeFor('th').enquirySentBody).toContain('เพื่อยืนยันเวลา');
    expect(chromeFor('en')).toBe(CHROME.en);
  });
});
