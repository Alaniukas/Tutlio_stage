import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { DRAFT_LOCALE_ALANO_FALLBACK_KEYS } from '../../src/lib/i18n/draftLocaleFallbacks';
import { ar, arOverrides } from '../../src/lib/i18n/ar';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { getDateFnsLocale } from '../../src/lib/i18n';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { getSeoMeta } from '../../src/lib/seoMeta';
import { isTranslatedLocale, LOCALE_FORMAT_TAGS, htmlLanguageCode } from '../../src/lib/i18n/locales';
import { CHROME, chromeFor, formatShortDay } from '../../src/lib/publicPage';
import { supportGeneralFollowUp } from '../../api/_lib/supportRequest';

const deferred = new Set(['admin', 'school', 'schoolsLanding', 'perlasFinance', 'tos', 'priv', 'dpa']);
const expectedKeys = Object.keys(en).filter((key) => !deferred.has(key.split('.')[0]) && !DRAFT_LOCALE_ALANO_FALLBACK_KEYS.has(key));
const tokens = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).sort();

beforeAll(() => loadLocaleDict('ar'));

describe('Arabic tutor and business copy', () => {
  it('covers every in-scope key explicitly and leaves the source key contract intact', () => {
    expect(Object.keys(arOverrides).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(expectedKeys.filter((key) => en[key] && !ar[key])).toEqual([]);
  });

  it.each([
    ['parameters', /\{[a-zA-Z_][a-zA-Z_0-9]*\}/g],
    ['HTML tags and attributes', /<\/?[a-zA-Z][^>]*>/g],
    ['numeric values', /\d+(?:[.,]\d+)?/g],
    ['URLs', /(?:https?:\/\/|mailto:)[^\s"'<>]+/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['line breaks', /\n/g],
  ] as const)('preserves %s throughout the dictionary', (_label, pattern) => {
    expect(expectedKeys.filter((key) =>
      JSON.stringify(tokens(en[key], pattern)) !== JSON.stringify(tokens(ar[key], pattern)),
    )).toEqual([]);
  });

  it('loads Arabic in browser, email and SSR without English platform overrides', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('ar', 'common.login')).toBe('تسجيل الدخول');
      expect(translate('ar', 'companyNav.students')).toBe('الطلاب');
      expect(translate('ar', 'chat.title')).toBe('الرسائل');
    }
    expect(t('ar', 'nav.forTutors', undefined, 'schools')).toBe(ar['nav.forTutors']);
    expect(t('ar', 'nav.forSchools', undefined, 'teachers')).toBe(ar['nav.forSchools']);
    expect(supportGeneralFollowUp('ar')).toBe('كيف يمكنني مساعدتك أيضًا؟');
  });

  it('preserves escaped user data and distinguishes cancellation, deletion and availability', () => {
    const html = tHtml('ar', 'stuSess.refundSuccessManualTutor', { tutor: '<script>alert(1)</script>' });
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(t('ar', 'stuSess.penaltyPayNote', { amount: 25 })).toBe('للإلغاء، يجب دفع رسوم الإلغاء البالغة €25.');
    expect(ar['cal.cancel']).toBe('إلغاء');
    expect(ar['common.delete']).toBe('حذف');
    expect(ar['cal.freeSlot']).toBe('فترة متاحة');
    expect(ar['invoices.statusPaid']).toBe('مدفوعة');
    expect(emailText('ar', 'em.payReminderBodyOther', { student: 'أحمد' }))
      .toBe('الطالب <strong>أحمد</strong> لم يدفع رسوم الدرس بعد.');
  });

  it('uses contextual explanations where the English label is incomplete', () => {
    expect(ar['studentWait.tooltip']).toContain('قائمة الانتظار');
    expect(ar['compSet.payDesc']).toContain('سعر الدرس − مستحقات المدرّس');
    expect(ar['stuSched.mustPayDesc']).toContain('لا يمكنك حجز');
    expect(ar['compSch.confirmNoAvailability']).toContain('على أي حال؟');
    expect(ar['dash.invoice']).toBe('فاتورة');
    expect(ar['invoice.invoiceTitle']).toBe('فاتورة');
    expect(ar['studentSettings.confirmDeleteMsg']).toContain('لا يمكن التراجع');
    expect(ar['cal.cancelAllFutureDesc']).toContain('السلسلة نفسها');
    expect(ar['cal.massCancelNote']).toContain('يتجاوز');
    expect(ar['compStu.manualPaymentHint']).toContain('دون Stripe');
  });

  it('keeps Arabic scheduling Gregorian without changing the HTML language or publication gate', () => {
    expect(new Intl.DateTimeFormat(LOCALE_FORMAT_TAGS.ar).resolvedOptions().calendar).toBe('gregory');
    expect(getDateFnsLocale('ar')?.code).toBe('ar-SA');
    expect(htmlLanguageCode('ar')).toBe('ar');
    expect(formatShortDay('2026-08-22', 'ar')).toContain('أغسطس');
    expect(getSeoMeta('ar', 'landing').title).toContain('إدارة الدروس الخصوصية');
    expect(getSeoMeta('ar', 'pricing').title).toContain('أسعار');
    expect(isTranslatedLocale('ar')).toBe(false);
    for (const key of Object.keys(en).filter((key) => deferred.has(key.split('.')[0]))) {
      expect(ar[key]).toBe(en[key]);
    }
  });

  it('localizes all public booking labels without changing other locales', () => {
    expect(Object.keys(CHROME.ar).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(chromeFor('ar').enquirySentTitle).toBe('أُرسل الاستفسار');
    expect(chromeFor('ar').book).toBe('احجز درسًا');
    expect(chromeFor('en')).toBe(CHROME.en);
    expect(chromeFor('it')).toBe(CHROME.it);
    for (const key of Object.keys(CHROME.en) as (keyof typeof CHROME.en)[]) {
      expect(CHROME.ar[key]).not.toBe('');
      expect(tokens(CHROME.ar[key], /\d+(?:[.,]\d+)?/g)).toEqual(tokens(CHROME.en[key], /\d+(?:[.,]\d+)?/g));
    }
  });
});
