import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { ko, koOverrides } from '../../src/lib/i18n/ko';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, localeDirection } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';
import { getCaseStudy, getTestimonials } from '../../src/components/landing/v2/socialProof';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';

const deferredPrefixes = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferredPrefixes.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(() => loadLocaleDict('ko'));

describe('Korean tutor and business localization', () => {
  it('accepts Korean international numbers without restricting the locale to one country', () => {
    expect(getLocalizedPhonePlaceholder('ko')).toBe('+82 10 1234 5678');
    expect(formatLocalizedPhone('+82 10 1234 5678', 'ko')).toBe('+821012345678');
    expect(validateLocalizedPhone('+82 10 1234 5678', 'ko')).toBe(true);
    expect(validateLocalizedPhone('+44 7700 900000', 'ko')).toBe(true);
    expect(validateLocalizedPhone('01012345678', 'ko')).toBe(false);
    expect(validateLocalizedPhone('+821012345678', 'lt')).toBe(false);
  });
  it('covers every in-scope source key and retains intentional English fallbacks', () => {
    expect(Object.keys(koOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !ko[key])).toEqual([]);
    for (const key of Object.keys(en).filter((key) => deferredPrefixes.has(key.split('.')[0]))) {
      expect(ko[key]).toBe(en[key]);
    }
  });

  it.each([
    ['interpolation parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s across the complete draft', (_label, pattern) => {
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(ko[key], pattern)),
    )).toEqual([]);
  });

  it('preserves numbers, including Korean numeric month names in two demo dates', () => {
    // Korean writes February/March as 2월/3월; these are dates, not changed amounts.
    const localizedDateSources: Record<string, string> = {
      'landing.v2.pillExam': en['landing.v2.pillExam'].replace('Feb', '2'),
      'landing.v2.demo.weekShort': en['landing.v2.demo.weekShort'].replace('March', '3'),
    };
    const numbers = /\d+(?:[.,]\d+)?/g;
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(localizedDateSources[key] ?? en[key], numbers)) !== JSON.stringify(tokens(ko[key], numbers)),
    )).toEqual([]);
    expect(ko['landing.v2.pillExam']).toBe('시험 2월 14일');
    expect(ko['landing.v2.demo.weekShort']).toBe('주간 · 3월 10–14일');
  });

  it('loads Korean through browser, email and server-rendered translations', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('ko', 'common.login')).toBe('로그인');
      expect(translate('ko', 'companyNav.students')).toBe('학생');
      expect(translate('ko', 'chat.title')).toBe('메시지');
      expect(translate('ko', 'quiz.audience.solo.title')).toBe('개인 튜터');
    }
    expect(supportGeneralFollowUp('ko')).toBe('또 무엇을 도와드릴까요?');
    expect(emailText('ko', 'em.packageHowBody', { count: 3, subject: '수학', label: emailText('ko', 'em.lessonFew') }))
      .toBe('결제 후 수학 수업을 <strong>3</strong>회 신청할 수 있습니다.');
  });

  it('keeps payment, compensation, deletion, cancellation and refunds distinct', () => {
    expect(ko['cal.cancel']).toBe('취소');
    expect(ko['common.delete']).toBe('삭제');
    expect(ko['settings.cancelSubBtn']).toBe('구독 해지');
    for (const key of ['stuSched.payBtn', 'studentDash.pay', 'subscribe.payBtn']) expect(ko[key]).toBe('결제');
    expect(ko['compSet.payDesc']).toContain('튜터 급여');
    expect(ko['studentSettings.confirmDeleteMsg']).toContain('되돌릴 수 없습니다');
    expect(ko['stuSched.mustPayDesc']).toContain('예약하거나 대기 목록에 등록할 수 없습니다');
    expect(t('ko', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('취소하려면 €25의 취소 수수료를 결제해야 합니다.');
    expect(ko['dash.invoice']).toBe('청구서');
    expect(ko['invoice.invoiceTitle']).toBe('청구서');
    expect(emailText('ko', 'em.payReminderBodyOther', { student: '민지' }))
      .toBe('<strong>민지</strong> 학생의 수업료가 아직 결제되지 않았습니다.');
  });

  it('escapes interpolated user data without breaking translated HTML', () => {
    const html = tHtml('ko', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
  });

  it('uses Korean formats and metadata while leaving publication gated', () => {
    expect(LOCALE_FORMAT_TAGS.ko).toBe('ko-KR');
    expect(getDateFnsLocale('ko').code).toBe('ko');
    expect(localeDirection('ko')).toBe('ltr');
    expect(getSeoMeta('ko', 'landing').title).toContain('개인 튜터');
    expect(getSeoMeta('ko', 'pricing').title).toContain('요금제');
    expect(isTranslatedLocale('ko')).toBe(false);
  });

  it('localizes the public booking interface and dates without altering fallback locales', () => {
    expect(Object.keys(CHROME.ko).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('ko').book).toBe('수업 예약');
    expect(chromeFor('ko').enquirySentTitle).toBe('문의가 발송되었습니다');
    expect(formatShortDay('2026-08-22', 'ko')).toBe('8월 22일');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('lt')).toBe(CHROME.lt);
    expect(chromeFor('fr')).toBe(CHROME.en);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.ko[key]).not.toBe('');
      expect(tokens(CHROME.ko[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });

  it('does not invent Korean customer identities, results or ratings', () => {
    const source = getCaseStudy('en'), translated = getCaseStudy('ko');
    expect(translated.org).toBe(source.org);
    expect(translated.authorName).toBe(source.authorName);
    expect(translated.stats.map((stat) => stat.value)).toEqual(source.stats.map((stat) => stat.value));
    expect(getTestimonials('ko').map(({ name, rating }) => ({ name, rating })))
      .toEqual(getTestimonials('en').map(({ name, rating }) => ({ name, rating })));
  });
});
