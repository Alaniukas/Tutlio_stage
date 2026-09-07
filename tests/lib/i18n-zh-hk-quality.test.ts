import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { format, parse } from 'date-fns';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { zhHk, zhHkOverrides } from '../../src/lib/i18n/zh-hk';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { formatLocalizedPhone, validateLocalizedPhone, getLocalizedPhonePlaceholder } from '../../src/lib/utils';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const phoneCorrections = new Set(['onboard.parentPhoneFormat', 'onboard.phoneFormatError', 'register.phoneError', 'register.phoneHint', 'settings.phoneFormat', 'stu.phoneFormat']);
// Numbers expressed as Chinese words, named months expressed numerically, and
// B2B translated as enterprise customers. Commercial quantities are unchanged.
const semanticNumbers = new Set(['compSet.commentVisibility', 'landing.v2.pillExam', 'landing.v2.demo.weekShort', 'orgTutorPolicy.s2Calendar', 'support.contact.whatsapp']);
const restoredArguments: Record<string, string[]> = {
};
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(async () => { await loadLocaleDict('zh-hk'); });

describe('Hong Kong Traditional Chinese tutor and business localization', () => {
  it('covers every scoped source key explicitly and keeps deferred modules English', () => {
    expect(Object.keys(zhHkOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(zhHk).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !zhHk[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) expect(zhHk[key]).toBe(en[key]);
  });

  it.each([
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['currency symbols and codes', /[€$£]|\b(?:EUR|PLN|USD|GBP|HKD)\b/g],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across all scoped strings', (_label, pattern) => {
    expect(expectedKeys.filter((key) => JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(zhHk[key], pattern)))).toEqual([]);
  });

  it('preserves parameters and restores only verified caller arguments', () => {
    const pattern = /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g;
    expect(expectedKeys.filter((key) => JSON.stringify([...tokens(en[key], pattern), ...(restoredArguments[key] ?? [])].sort()) !== JSON.stringify(tokens(zhHk[key], pattern)))).toEqual([]);
    expect(t('zh-hk', 'compStu.cancellationInfo', { hours: 24, percent: 50 })).toBe('取消時限：課前 24 小時（取消費 50%）');
    expect(t('zh-hk', 'cal.massCancelChars', { count: 4 })).toBe('已輸入 4 個字元（最少 5 個）');
    expect(t('zh-hk', 'invoice.emailNote', { days: 7 })).toContain('7 天');
    expect(t('zh-hk', 'studentWait.addedOn', { date: '8月31日' })).toBe('加入日期：8月31日');
    expect(t('zh-hk', 'em.payReminderTiming', { hours: 24, timing: t('zh-hk', 'em.payReminderBefore') })).toBe('課堂前 24 小時');
    expect(t('zh-hk', 'em.payReminderTiming', { hours: 2, timing: t('zh-hk', 'em.payReminderAfter') })).toBe('課堂後 2 小時');
  });

  it('keeps numeric claims and prices except documented linguistic and phone changes', () => {
    const pattern = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter((key) => !phoneCorrections.has(key) && !semanticNumbers.has(key) && JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(zhHk[key], pattern)))).toEqual([]);
    for (const key of phoneCorrections) {
      expect(zhHk[key]).toContain('+852');
      expect(zhHk[key]).not.toContain('+370');
    }
    expect(zhHk['landing.v2.pillExam']).toBe('2 月 14 日考試');
    expect(zhHk['landing.v2.demo.weekShort']).toBe('本週 · 3 月 10–14 日');
  });

  it('loads consistent frontend, email, SSR and support language', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('zh-hk', 'common.login')).toBe('登入');
      expect(translate('zh-hk', 'quiz.audience.solo.title')).toBe('個人導師');
      expect(translate('zh-hk', 'companyNav.students')).toBe('學生');
    }
    expect(supportGeneralFollowUp('zh-hk')).toBe('還有甚麼可以幫你？');
    const html = tHtml('zh-hk', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
  });

  it('keeps payment distinctions, irreversible warnings and source context', () => {
    expect(t('zh-hk', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('你必須支付 €25 取消費才可取消課堂。');
    expect(zhHk['stuSched.monthlyBillingReserved']).toContain('現在毋須付款');
    expect(zhHk['stuSched.mustPayDesc']).toContain('無法預約');
    expect(zhHk['studentSettings.confirmDeleteMsg']).toContain('無法復原');
    expect(zhHk['compSet.payDesc']).toContain('減去導師薪酬');
    expect(zhHk['compSch.confirmNoAvailability']).toContain('仍要建立課堂嗎');
    expect(zhHk['dash.invoice']).toBe('發票');
    expect(zhHk['invoice.invoiceTitle']).toBe('發票');
    expect(zhHk['parent.freeWith']).toContain('可預約時段');
    expect(zhHk['common.delete']).not.toBe(zhHk['cal.cancel']);
    expect(zhHk['dynamicPricing.studentFrequency']).toContain('頻率');
    expect(zhHk['dynamicPricing.frequencyAuto']).toContain('時間表');
  });

  it('uses Hong Kong calendar formatting and preserves dates through parsing', () => {
    const locale = getDateFnsLocale('zh-hk');
    const date = new Date(2026, 7, 31, 14, 30);
    expect(locale?.code).toBe('zh-HK');
    expect(format(date, 'EEEE', { locale })).toBe('星期一');
    for (let month = 0; month < 12; month++) {
      const fixture = new Date(2026, month, 12, 14, 30);
      for (const pattern of ['PPPP', 'PPPp', 'PP', 'P']) {
        const text = format(fixture, pattern, { locale });
        expect(format(parse(text, pattern, date, { locale }), pattern, { locale })).toBe(text);
      }
    }
    expect(new Intl.DateTimeFormat('zh-HK').resolvedOptions().calendar).toBe('gregory');
  });

  it('supports Hong Kong phone numbers without weakening Lithuanian rules', () => {
    expect(formatLocalizedPhone('+852 6123 4567', 'zh-hk')).toBe('+85261234567');
    expect(validateLocalizedPhone('+85261234567', 'zh-hk')).toBe(true);
    expect(validateLocalizedPhone('61234567', 'zh-hk')).toBe(false);
    expect(getLocalizedPhonePlaceholder('zh-hk')).toBe('+852 6123 4567');
    expect(validateLocalizedPhone('+85261234567', 'lt')).toBe(false);
    expect(validateLocalizedPhone('+37061234567', 'lt')).toBe(true);
  });

  it('localizes public pages without publishing the locale', () => {
    expect(LOCALE_FORMAT_TAGS['zh-hk']).toBe('zh-HK');
    expect(htmlLanguageCode('zh-hk')).toBe('zh-HK');
    expect(localeDirection('zh-hk')).toBe('ltr');
    expect(isTranslatedLocale('zh-hk')).toBe(false);
    expect(getSeoMeta('zh-hk', 'landing').title).toContain('補習機構');
    expect(Object.keys(CHROME['zh-hk']).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('zh-hk').enquirySentTitle).toBe('申請已提交');
    expect(formatShortDay('2026-08-22', 'zh-hk')).toBe('8月22日');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
  });

  it('prepares preference constraints for both account types without dropping registered locales', () => {
    const sql = readFileSync('supabase/migrations/20260831234508_add_hong_kong_locale.sql', 'utf8');
    expect(sql).toContain("ARRAY['profiles', 'organizations']");
    expect(sql).toContain('pg_get_expr(c.conbin, c.conrelid)');
    expect(sql).toContain('CHECK ((%s) OR preferred_locale = %L)');
    expect(sql).toContain("existing_condition, 'zh-hk'");
    expect(sql).not.toContain('preferred_locale IN (');
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY|UPDATE public\./);
  });
});
