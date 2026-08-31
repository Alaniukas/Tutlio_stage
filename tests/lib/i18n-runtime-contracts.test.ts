import { beforeAll, describe, expect, it } from 'vitest';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { SUPPORTED_LOCALES } from '../../src/lib/i18n/locales';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';

// These parameters are supplied by the real waitlist, invoice, cancellation and
// reminder callers. Comparing dictionaries only to EN previously hid lost data.
const messages = [
  ['companyWait.inQueueSince', { date: '2026-08-31 14:37' }],
  ['studentWait.addedOn', { date: '31 Aug 2026' }],
  ['compStu.cancellationInfo', { hours: 24, percent: 50 }],
  ['invoice.emailNote', { days: 14 }],
  ['em.payReminderTiming', { hours: 48, timing: 'BEFORE_LESSON' }],
  ['cal.massCancelChars', { count: 3 }],
  ['cal.addStudentsBtn', { count: 3 }],
  ['cal.addStudentsSuccess', { count: 3 }],
  ['cal.alreadyInGroup', { names: 'Ada, Sam' }],
  ['cal.cancelledCount', { count: 3 }],
  ['cal.groupFull', { max: 5 }],
  ['cal.massCancelCount', { count: 3 }],
  ['cal.selectedStudents', { count: 3 }],
  ['cal.studentGrade', { name: 'Ada', grade: 8 }],
  ['cal.studentsCount', { count: 3 }],
  ['cal.syncSuccess', { sessions: 7, avail: 4 }],
  ['companyWait.ofTotal', { filtered: 3, total: 11 }],
  ['compSch.everyDay', { day: 'TUESDAY' }],
  ['compSch.oneTimeAvailHtml', { date: '2026-09-02', timeRange: '16:30–17:30' }],
  ['compSch.seriesSummaryHtml', { fromDate: '2026-09-02', weekday: 'TUESDAY', timeRange: '16:30–17:30' }],
  ['compStu.packageSent', { name: 'Ada' }],
  ['compStu.tutorsSelected', { count: 3 }],
  ['compTut.registered', { count: 3 }],
  ['em.afterLessonStudentPart', { student: 'Ada' }],
  ['em.invoiceBody', { tutor: 'Alex', period: 'AUGUST', studentPart: 'FOR_ADA' }],
  ['em.invoiceStudentPart', { student: 'Ada' }],
  ['em.packageReqStudentPart', { student: 'Ada' }],
  ['finance.deadlineWarning', { hours: 24 }],
  ['invoice.sendInvoice', { name: 'Ada' }],
  ['invoice.sendInvoiceCount', { count: 3 }],
  ['lessonSet.orgLockedAll', { org: 'Example Academy' }],
  ['orgFinance.completedLessons', { range: 'AUGUST' }],
  ['package.tooltipTutor', { amount: '€25.37' }],
  ['package.tooltipPlatform', { amount: '€2.54' }],
  ['package.tooltipStripe', { amount: '€0.82' }],
  ['register.orgInvite', { orgName: 'Example Academy' }],
  ['settings.subValidUntil', { date: '2026-09-02' }],
  ['settings.trialRemaining', { days: 3, date: '2026-09-02', amount: '€29.99' }],
  ['studentDash.cardTotal', { amount: '€28.73' }],
  ['stuSched.payAfterLesson', { deadline: '2026-09-02 16:30' }],
  ['stuSched.payBefore', { deadline: '2026-09-02 16:30' }],
  ['stuSched.queueClosedDesc', { deadline: '2026-09-02 16:30' }],
  ['stuSess.lateCancelDesc', { hours: 24, percent: 50 }],
  ['stuSess.lateCancelPaidDesc', { hours: 24, percent: 50 }],
  ['waitlist.reservedSessions', { count: 3 }],
] as const;

beforeAll(async () => { await Promise.all(SUPPORTED_LOCALES.map(loadLocaleDict)); });

describe('runtime translation contracts across all locales', () => {
  it.each(SUPPORTED_LOCALES)('%s retains the actual dates, limits and deadlines in every renderer', (locale) => {
    for (const [key, params] of messages) {
      for (const translate of [t, emailText, ssrText]) {
        const result = translate(locale, key, params);
        expect(result, `${locale}: ${key}`).not.toBe(key);
        expect(result).not.toMatch(/\{\w+\}/);
        for (const value of Object.values(params)) expect(result).toContain(String(value));
      }
    }
    expect(t(locale, 'cal.massCancelChars', { count: 3 })).toContain('5');
  });

  it.each([t, emailText, ssrText])('preserves literal user values without replacement syntax or recursive substitution', (translate) => {
    const date = "$& $$ $` $' {hours}";
    expect(translate('en', 'companyWait.inQueueSince', { date, hours: 999 })).toBe(`In queue since ${date}`);
    expect(translate('en', 'companyWait.inQueueSince', Object.create({ date: 'inherited' }))).toBe('In queue since {date}');
    expect(translate('en', 'invoice.emailNote', { days: 0 })).toContain('0 days');
  });

  it('retains the HTML-escaping boundary while keeping inserted text literal', () => {
    const result = tHtml('en', 'stuSess.refundSuccessManualTutor', { tutor: '<b>$& {days}</b>', days: 999 });
    expect(result).toContain('&lt;b&gt;$&amp; {days}&lt;/b&gt;');
    expect(result).not.toContain('<b>');
    expect(result).not.toContain('999');
  });

  it.each(SUPPORTED_LOCALES)('%s keeps generic errors safe instead of exposing database details', (locale) => {
    for (const key of ['cal.syncSendFailed', 'cal.syncSessionError', 'compStu.pricingSaveFailed']) {
      const result = t(locale, key, { error: 'PRIVATE_DATABASE_DETAIL', msg: 'PRIVATE_DATABASE_DETAIL' });
      expect(result).not.toContain('PRIVATE_DATABASE_DETAIL');
      expect(result).not.toMatch(/\{\w+\}/);
    }
  });

  it('distinguishes the add action from saving, and weekly recurrence from daily recurrence', () => {
    expect(t('en', 'cal.addStudentsBtn', { count: 3 })).toBe('Add (3)');
    expect(t('en', 'compSch.everyDay', { day: 'Tuesday' })).toBe('Recurring: Tuesday');
    expect(t('en', 'lessonSet.orgLockedAll', { org: 'Example Academy' })).toContain('Contact the company administrator');
    expect(t('en', 'stuSess.lateCancelDesc', { hours: 24, percent: 50 })).toContain('less than 24 hours before');
  });
});
