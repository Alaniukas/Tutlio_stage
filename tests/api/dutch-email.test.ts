import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: vi.fn() }));
import handler from '../../api/send-email';
import { t } from '../../api/_lib/i18n';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service');
});
afterEach(() => vi.unstubAllEnvs());

async function preview(type: string, data: Record<string, unknown>) {
  let statusCode = 0;
  let payload: { html: string; subject: string } | undefined;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(body: { html: string; subject: string }) { payload = body; return this; },
    setHeader() { return this; },
  };
  await handler({
    method: 'POST', query: {}, headers: { 'x-internal-key': 'test-only-service' },
    body: { type, to: 'payer@example.com', locale: 'nl', dryRun: true,
      data: { studentName: 'Noor', recipientName: 'Ouder', tutorName: 'Sanne', date: '2026-09-01',
        time: '16:30', price: 25, paymentUrl: 'https://example.com/pay/123', ...data } },
  } as never, response as never);
  expect(statusCode).toBe(200);
  expect(payload?.html).toContain('<html lang="nl" dir="ltr">');
  expect(sendMock).not.toHaveBeenCalled();
  return payload!;
}

describe('Dutch transactional emails', () => {
  it.each([
    { paymentTiming: 'before_lesson', deadlineHours: 24, expected: '24 uur vóór de les' },
    { paymentTiming: 'after_lesson', deadlineHours: 2, expected: '2 uur na de les' },
  ])('renders the $paymentTiming deadline and complete payment reminder', async ({ expected, ...data }) => {
    const { html } = await preview('payment_reminder', data);
    expect(html).toContain('Betalingstermijn');
    expect(html).toContain(expected);
    expect(html).toContain('Leerling <strong>Noor</strong> heeft de les nog niet betaald.');
    expect(html).toContain('https://example.com/pay/123');
    expect(html).not.toMatch(/\{(?:hours|timing|student)\}/);
  });

  it('renders a self-payer reminder without an unfinished sentence', async () => {
    const { html } = await preview('payment_reminder', {
      recipientName: 'Noor', paymentTiming: 'before_lesson', deadlineHours: 24,
    });
    expect(html).toContain('Je hebt de les nog niet betaald.');
    expect(html).not.toContain('Jij nog steeds');
  });

  it.each(['tutor', 'student'])('composes the %s cancellation without duplicated prepositions', async cancelledBy => {
    const { html } = await preview('session_cancelled', { cancelledBy, cancellationReason: 'Planning gewijzigd' });
    expect(html).toContain(`op initiatief van de ${cancelledBy === 'tutor' ? 'docent' : 'leerling'}`);
    expect(html).not.toContain('van van');
  });

  it('preserves and escapes the child name in a parent invoice', async () => {
    const { html } = await preview('monthly_invoice', { studentName: '<b>Noor</b>', periodText: 'september',
      amount: 25, sessions: [], deadlineDays: 14 });
    expect(html).toContain('voor leerling &lt;b&gt;Noor&lt;/b&gt;');
    expect(html).not.toContain('<b>Noor</b>');
  });

  it.each([1, 2, 10])('uses the correct lesson noun for a package with %i remaining', async count => {
    const { html } = await preview('prepaid_package_success', {
      availableLessons: count, totalLessons: count, subjectName: 'wiskunde', totalPrice: count * 25,
    });
    expect(html).toContain(`<strong>${count}</strong> ${count === 1 ? 'les' : 'lessen'} wiskunde`);
  });

  it('localizes the new-student notification outside the main dictionary', async () => {
    const { html, subject } = await preview('tutor_student_assigned', {});
    expect(subject).toBe('Nieuwe leerling aan je toegewezen');
    expect(html).toContain('Er is een nieuwe leerling aan je toegewezen: <strong>Noor</strong>.');
    expect(html).toContain('Gebruik Tutlio voor je lessen');
    expect(html).not.toMatch(/New Student|Hello|For lessons/);
  });

  it('localizes the recurring lesson-status reminder without sending it', async () => {
    const { html, subject } = await preview('lesson_status_confirmation_reminder', {
      count: 2, lessons: [{ date: '2026-09-01', time: '16:30', student: 'Noor' }],
    });
    expect(subject).toBe('Bevestig je lesstatussen (2)');
    expect(html).toContain(t('nl', 'cal.confirmStatusPrompt'));
    expect(html).toContain('aantal overige lessen: 1.');
    expect(html).not.toMatch(/Lessons awaiting status|Confirm statuses|Reminders repeat daily/);
  });
});
