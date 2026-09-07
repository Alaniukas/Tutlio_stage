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
    body: { type, to: 'tutor@example.com', locale: 'cs', dryRun: true, data },
  } as never, response as never);
  expect(statusCode).toBe(200);
  expect(payload?.html).toContain('<html lang="cs" dir="ltr">');
  expect(sendMock).not.toHaveBeenCalled();
  return payload!;
}

describe('Czech payment reminder preview', () => {
  it.each([
    { paymentTiming: 'before_lesson', hours: 24, recipientName: 'Rodič', timingText: '24 h před začátkem lekce' },
    { paymentTiming: 'after_lesson', hours: 2, recipientName: '<b>Eva</b>', timingText: '2 h po skončení lekce' },
  ])('renders the $paymentTiming deadline without sending', async ({ paymentTiming, hours, recipientName, timingText }) => {
    let statusCode = 0;
    let payload: { html: string; subject: string } | undefined;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(body: { html: string; subject: string }) { payload = body; return this; },
      setHeader() { return this; },
    };
    await handler({
      method: 'POST', query: {}, headers: { 'x-internal-key': 'test-only-service' },
      body: {
        type: 'payment_reminder', to: 'payer@example.com', locale: 'cs', dryRun: true,
        data: { studentName: '<b>Eva</b>', recipientName, tutorName: 'Lektor',
          date: '2026-09-01', time: '16:30', price: 25, deadlineHours: hours,
          paymentTiming, paymentUrl: 'https://example.com/pay/123' },
      },
    } as never, response as never);
    expect(statusCode).toBe(200);
    expect(payload?.html).toContain('<html lang="cs" dir="ltr">');
    expect(payload?.html).toContain('Lhůta pro úhradu');
    expect(payload?.html).toContain(timingText);
    expect(payload?.html).toContain(recipientName === 'Rodič'
      ? 'Student <strong>&lt;b&gt;Eva&lt;/b&gt;</strong> ještě nezaplatil za lekci.'
      : 'Ještě jste nezaplatili za lekci.');
    expect(payload?.html).not.toContain('<b>Eva</b>');
    expect(payload?.html).toContain('https://example.com/pay/123');
    expect(payload?.html).toContain('25');
    expect(payload?.html).not.toMatch(/\{(?:hours|timing|student)\}/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('Czech tutor notification previews', () => {
  it.each([true, false])('renders a student assignment with contacts=%s without exposing markup', async (withContacts) => {
    const payload = await preview('tutor_student_assigned', {
      tutorName: '<b>Jan</b>', studentName: '<b>Eva</b>',
      ...(withContacts ? { studentEmail: 'eva@example.com', studentPhone: '+420 601 123 456' } : {}),
    });
    expect(payload.subject).toBe('Byl vám přiřazen nový student');
    expect(payload.html).toContain('Dobrý den');
    expect(payload.html).toContain('Byl vám přiřazen nový student:');
    expect(payload.html).not.toContain('<b>');
    if (withContacts) {
      expect(payload.html).toContain('E-mail');
      expect(payload.html).toContain('Telefon');
      expect(payload.html).toContain('eva@example.com');
      expect(payload.html).toContain('+420 601 123 456');
      expect(payload.html).not.toContain('například sekci Studenti nebo Zprávy');
    } else {
      expect(payload.html).toContain('například sekci Studenti nebo Zprávy');
      expect(payload.html).not.toContain('eva@example.com');
    }
    expect(payload.html).not.toContain('A new student has been assigned');
  });

  it.each([1, 2, 5])('renders status reminders with count=%s and the correct remaining count', async (count) => {
    const payload = await preview('lesson_status_confirmation_reminder', {
      count, tutorName: '<b>Jan</b>',
      lessons: [{ date: '1. 9. 2026', time: '16:30', student: '<b>Eva</b>' }],
    });
    expect(payload.subject).toBe(`Potvrďte stavy lekcí (${count})`);
    expect(payload.html).toContain(`Potvrďte stavy lekcí (${count})`);
    expect(payload.html).toContain(t('cs', 'cal.statusNoShowOpt'));
    expect(payload.html).toContain(t('cs', 'cal.statusCancelledOpt'));
    expect(payload.html).toContain(t('cs', 'cal.confirmStatusPrompt'));
    expect(payload.html).toMatch(/href="https?:\/\/[^"\s]+\/dashboard\?lang=cs"/);
    expect(payload.html).toContain('každý den, dokud nepotvrdíte stav všech lekcí');
    expect(payload.html).toContain('1. 9. 2026');
    expect(payload.html).not.toContain('<b>');
    if (count > 1) expect(payload.html).toContain(`… další lekce: ${count - 1}.`);
    else expect(payload.html).not.toContain('… další lekce:');
    expect(payload.html).not.toContain('Lessons awaiting status');
  });
});
