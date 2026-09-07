import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTOR_NOTIFICATION_COPY } from '../../api/_lib/tutorNotificationCopy';
import { t } from '../../api/_lib/i18n';
import { SUPPORTED_LOCALES, htmlLanguageCode, localeDirection, LOCALE_FORMAT_TAGS, type Locale } from '../../src/lib/i18n/locales';

const { sendMock, pushMock } = vi.hoisted(() => ({ sendMock: vi.fn(), pushMock: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: pushMock }));
import handler from '../../api/send-email';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service');
  vi.stubEnv('APP_URL', 'https://tutlio.com');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Email previews must not access the network'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function preview(locale: Locale, type: string, data: Record<string, unknown>) {
  let status = 0;
  let payload: { html: string; subject: string } | undefined;
  const response = {
    status(code: number) { status = code; return this; },
    json(body: typeof payload) { payload = body; return this; },
    setHeader() { return this; },
  };
  await handler({
    method: 'POST', query: {}, headers: { 'x-internal-key': 'test-only-service' },
    body: { type, to: 'tutor@example.com', locale, dryRun: true, data },
  } as never, response as never);
  expect(status).toBe(200);
  expect(sendMock).not.toHaveBeenCalled();
  expect(pushMock).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(payload?.html).toContain(`<html lang="${htmlLanguageCode(locale)}" dir="${localeDirection(locale)}">`);
  return payload!;
}

describe('tutor notification coverage and safe rendering', () => {
  it('requires explicit copy for every supported locale, without new English fallbacks', () => {
    expect(Object.keys(TUTOR_NOTIFICATION_COPY).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of Object.keys(TUTOR_NOTIFICATION_COPY.en) as (keyof typeof TUTOR_NOTIFICATION_COPY.en)[]) {
        const value = TUTOR_NOTIFICATION_COPY[locale][key];
        expect(value.trim()).not.toBe('');
        expect(placeholders(value)).toEqual(placeholders(TUTOR_NOTIFICATION_COPY.en[key]));
        if (locale !== 'en') expect(value).not.toBe(TUTOR_NOTIFICATION_COPY.en[key]);
      }
    }
  });

  describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
    const money = (amount: number) => new Intl.NumberFormat(LOCALE_FORMAT_TAGS[locale], {
      style: 'currency', currency: locale === 'pl' ? 'PLN' : 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
    it.each(['payment_after_lesson_reminder', 'prepaid_package_request', 'monthly_invoice'])('%s identifies the child when the payer is a parent', async (type) => {
      const { html } = await preview(locale, type, {
        studentName: '<b>Ada $&</b>', recipientName: 'Guardian', tutorName: 'Alex',
        date: '2026-09-02', time: '16:30', amount: 25, payByTime: '2026-09-04 16:30',
        totalLessons: 5, pricePerLesson: 25, totalPrice: 125, subjectName: 'ALGEBRA',
        periodText: 'AUGUST', totalAmount: 125, dueDate: '2026-09-04',
        paymentUrl: 'https://example.com/pay', paymentLink: 'https://example.com/pay',
        sessions: [{ date: '2026-09-02', time: '16:30', subject: 'ALGEBRA', price: 25 }],
      });
      expect(html).toContain('&lt;b&gt;Ada $&amp;&lt;/b&gt;');
      expect(html).not.toContain('<b>Ada');
      expect(html).not.toMatch(/\{(?:student|studentPart|tutor|period)\}/);
      if (type === 'monthly_invoice') expect(html).toContain('AUGUST');
      expect(html).toContain(money(25));
    });

    it.each([false, true])('keeps organization deadline/context details for context=%s', async (context) => {
      const { html } = await preview(locale, 'payment_deadline_warning_org_admin', {
        recipientName: 'Admin', studentName: 'Ada', assignedTutorName: 'Alex',
        sessionDate: '2026-09-02', sessionTime: '16:30', price: 25,
        deadlineTime: '2026-09-01 16:30', ...(context ? { paymentContext: 'MONTHLY_ACCOUNT' } : {}),
      });
      if (context) {
        expect(html).toContain('MONTHLY_ACCOUNT');
        expect(html).not.toContain('2026-09-01 16:30');
      } else {
        expect(html).toContain(t(locale, 'em.labelPaymentDeadline'));
        expect(html).toContain('2026-09-01 16:30');
      }
      expect(html).toContain(money(25));
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('mailto:');
      expect(html).toContain(`https://tutlio.com/company/sessions?lang=${locale}`);
    });

    it('renders only available deadline-warning contacts and preserves the portal language', async () => {
      const { html } = await preview(locale, 'payment_deadline_warning_tutor', {
        tutorName: 'Alex', studentName: 'Ada', studentPhone: '+421 900 123 456',
        sessionDate: '2026-09-02', sessionTime: '16:30', price: 25, deadlineTime: '2026-09-01 16:30',
      });
      expect(html).toContain('<span dir="ltr">+421 900 123 456</span>');
      expect(html).not.toContain('mailto:');
      expect(html).not.toContain('undefined');
      expect(html).toContain(`https://tutlio.com/dashboard?lang=${locale}`);
    });

    it('keeps manual package amount and organization without a duplicated heading', async () => {
      const { html } = await preview(locale, 'manual_package_request', {
        recipientName: 'Guardian', studentName: 'Ada', orgName: 'Example Academy',
        totalLessons: 5, pricePerLesson: 25, totalPrice: 125, subjectName: 'ALGEBRA',
        bankDetails: 'DEMO-ACCOUNT', paymentUrl: '',
      });
      expect(html).toContain('Example Academy');
      expect(html).toContain(money(125));
      expect(html).toContain(t(locale, 'em.manualPkgContactOrg'));
      expect(html).toContain(t(locale, 'em.manualPkgActivation'));
      expect(html.split(t(locale, 'em.manualPkgHowTitle'))).toHaveLength(2);
      expect(html).not.toMatch(/\{(?:price|org)\}/);
    });

    it.each([true, false])('keeps manual-payment instructions and the portal language for parent=%s', async (payerIsParent) => {
      const { html } = await preview(locale, 'payment_reminder', {
        manualPaymentInstructions: true, payerIsParent,
        studentName: 'Student', tutorName: 'Tutor', recipientName: 'Payer',
        date: '2026-08-31', time: '14:30', price: 25,
        bankDetails: '<b>Bank</b> Account ABC-123', deadlineHours: 48, paymentTiming: 'before_lesson',
        paymentUrl: 'https://example.com/card-checkout-must-not-appear',
      });
      expect(html).toContain(t(locale, 'em.manualPayInstructionsLead'));
      expect(html).toContain(t(locale, 'em.manualPayPortalHint'));
      expect(html).toContain(t(locale, payerIsParent ? 'em.btnParentLessonsPay' : 'em.btnStudentSessionsPay'));
      expect(html).toContain(`https://tutlio.com/${payerIsParent ? 'parent/lessons' : 'student/sessions'}?lang=${locale}`);
      expect(html).toContain('&lt;b&gt;Bank&lt;/b&gt; Account ABC-123');
      expect(html).not.toContain('<b>');
      expect(html).not.toContain('card-checkout-must-not-appear');
      expect(html).toContain(t(locale, 'em.payReminderTiming', { hours: 48, timing: t(locale, 'em.payReminderBefore') }));
      expect(html).toContain(t(locale, 'em.labelTutor'));
      expect(html).toContain('Tutor');
    });

    it.each([true, false])('renders student assignments with contacts=%s and escaped names', async (contacts) => {
      const { subject, html } = await preview(locale, 'tutor_student_assigned', {
        tutorName: '<b>Tutor $&</b>', studentName: '<b>Student $&</b>',
        ...(contacts ? { studentEmail: 'student@example.com', studentPhone: '+421 900 123 456' } : {}),
      });
      expect(subject).toBe(TUTOR_NOTIFICATION_COPY[locale].assignmentSubject);
      expect(html).toContain('&lt;b&gt;Student $&amp;&lt;/b&gt;');
      expect(html).toContain('&lt;b&gt;Tutor $&amp;&lt;/b&gt;');
      expect(html).not.toContain('<b>');
      expect(html).not.toMatch(/\{(?:student|name)\}/);
      if (contacts) {
        expect(html).toContain(t(locale, 'common.email'));
        expect(html).toContain(t(locale, 'common.phone'));
        expect(html).toContain('<span dir="ltr">+421 900 123 456</span>');
        expect(html).not.toContain(TUTOR_NOTIFICATION_COPY[locale].assignmentNoContact);
      } else {
        expect(html).toContain(TUTOR_NOTIFICATION_COPY[locale].assignmentNoContact);
        expect(html).not.toContain('student@example.com');
      }
    });

    it.each([1, 2, 5])('renders %i lesson statuses and retains the language in the action link', async (count) => {
      const { html, subject } = await preview(locale, 'lesson_status_confirmation_reminder', {
        count, tutorName: '<b>Tutor</b>',
        lessons: [{ date: '2026-08-31', time: '14:30', student: '<b>Student</b>' }],
      });
      expect(subject).toBe(TUTOR_NOTIFICATION_COPY[locale].statusSubject.replace('{count}', String(count)));
      expect(html).toContain('https://tutlio.com/dashboard?lang=' + locale);
      expect(html).toContain('2026-08-31');
      expect(html).toContain('14:30');
      expect(html).toContain('&lt;b&gt;Student&lt;/b&gt;');
      expect(html).not.toContain('<b>');
      expect(html).not.toMatch(/\{(?:count|name)\}/);
      for (const key of ['cal.confirmStatusDesc', 'cal.statusHappened', 'cal.statusHappenedLate', 'cal.statusNoShowOpt', 'cal.statusCancelledOpt']) {
        expect(html).toContain(t(locale, key));
      }
      const more = TUTOR_NOTIFICATION_COPY[locale].statusMore.replace('{count}', String(count - 1));
      if (count > 1) expect(html).toContain(more);
      else expect(html).not.toContain(more);
      expect(html).toContain(TUTOR_NOTIFICATION_COPY[locale].statusDaily);
    });
  });

  it.each([-1, 'invalid', 1.5])('does not display an invalid lesson count: %s', async (count) => {
    const { subject, html } = await preview('en', 'lesson_status_confirmation_reminder', { count, lessons: [{ student: 'Student' }] });
    expect(subject).toBe('Confirm your lesson statuses (1)');
    expect(html).not.toContain('NaN');
  });
});
