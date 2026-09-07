import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { ja, jaOverrides } from '../../src/lib/i18n/ja';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, htmlLanguageCode } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter(key => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(() => loadLocaleDict('ja'));

describe('Japanese tutor and business localization', () => {
  it('covers every in-scope key and keeps the separate modules on English fallback', () => {
    expect(Object.keys(jaOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter(key => en[key] && !ja[key])).toEqual([]);
    for (const key of Object.keys(en).filter(key => deferred.has(key.split('.')[0]))) {
      expect(ja[key], key).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across the complete dictionary', (_label, pattern) => {
    expect(expectedKeys.filter(key =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(ja[key], pattern)),
    )).toEqual([]);
  });

  it('preserves numeric meaning, including named months rendered as Japanese month numbers', () => {
    const dateSources: Record<string, string> = {
      'landing.v2.pillExam': 'Exam 2 14', // February 14 → 2月14日
      'landing.v2.demo.weekShort': 'Week · 3 10–14', // March → 3月
    };
    const pattern = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter(key =>
      JSON.stringify(tokens(dateSources[key] ?? en[key], pattern)) !== JSON.stringify(tokens(ja[key], pattern)),
    )).toEqual([]);
    expect(ja['landing.v2.pillExam']).toBe('試験：2月14日');
    expect(ja['landing.v2.demo.weekShort']).toBe('週表示 · 3月10–14日');
  });

  it('serves Japanese in frontend, email and SSR contexts', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('ja', 'common.login')).toBe('ログイン');
      expect(translate('ja', 'quiz.audience.solo.title')).toBe('個人講師');
      expect(translate('ja', 'stuSched.payBtn')).toBe('支払う');
    }
    expect(emailText('ja', 'em.payReminderBodyOther', { student: '山田' }))
      .toBe('受講者<strong>山田</strong>さんのレッスン料金がまだ支払われていません。');
    expect(supportGeneralFollowUp('ja')).toBe('ほかにお手伝いできることはありますか？');
  });

  it('escapes user input and preserves consequential booking and payment distinctions', () => {
    const html = tHtml('ja', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('ja', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('キャンセルするには、キャンセル料€25のお支払いが必要です。');
    expect(ja['cal.cancel']).toBe('キャンセル');
    expect(ja['common.delete']).toBe('削除');
    expect(ja['stuSched.mustPayDesc']).toContain('新しいレッスンの予約やキャンセル待ちへの登録はできません');
    expect(ja['compSet.payDesc']).toContain('講師報酬を差し引いた金額');
    expect(ja['compSch.confirmNoAvailability']).toContain('それでもレッスンを作成しますか？');
    expect(ja['compSet.noTutorTemplate']).toBe('講師未割り当て（テンプレート）');
    expect(ja['dash.invoice']).toBe('請求書');
    expect(ja['invoice.invoiceTitle']).toBe('請求書');
    expect(t('ja', 'studentWait.addedOn', { date: '8月31日' })).toBe('追加日：8月31日');
  });

  it('uses ja / ja-JP without publishing the locale for search', () => {
    expect(htmlLanguageCode('ja')).toBe('ja');
    expect(LOCALE_FORMAT_TAGS.ja).toBe('ja-JP');
    expect(getDateFnsLocale('ja').code).toBe('ja');
    expect(getSeoMeta('ja', 'landing').title).toBe('講師・個別指導教室向け運営管理ソフト | Tutlio');
    expect(getSeoMeta('ja', 'pricing').title).toContain('料金');
    expect(isTranslatedLocale('ja')).toBe(false);
  });

  it('localizes the public enquiry interface without implying immediate confirmation', () => {
    expect(Object.keys(CHROME.ja).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('ja')).toBe(CHROME.ja);
    expect(chromeFor('ja').enquirySentBody).toContain('日時の確定について');
    expect(chromeFor('ja').demoBanner).toContain('実際の予約と決済はまだ接続されていません');
    expect(formatShortDay('2026-08-22', 'ja')).toBe('8月22日');
    expect(chromeFor('en')).toBe(CHROME.en);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.ja[key], key).not.toBe('');
      expect(tokens(CHROME.ja[key], /\d+/g), key).toEqual(tokens(CHROME.en[key], /\d+/g));
    }
  });
});
