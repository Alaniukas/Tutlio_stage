import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: vi.fn() }));

import handler from '../../api/send-email';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service');
});

async function preview(type: string, data: Record<string, unknown>): Promise<string> {
  let statusCode = 0;
  let html = '';
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(body: { html: string }) { html = body.html; return this; },
    setHeader() { return this; },
  };
  await handler({
    method: 'POST', query: {}, headers: { 'x-internal-key': 'test-only-service' },
    body: { type, to: 'parent@example.com', locale: 'lt', dryRun: true, data },
  } as never, response as never);
  expect(statusCode).toBe(200);
  expect(sendMock).not.toHaveBeenCalled();
  return html;
}

describe('monthly booking emails', () => {
  it('renders an unpaid reserved lesson without a payment request', async () => {
    const html = await preview('booking_confirmation', {
      forPayer: true,
      bookedBy: 'tutor',
      studentName: 'Mokinys',
      tutorName: 'Mokytojas',
      date: '2026-10-01',
      time: '16:00',
      price: 25,
      paymentStatus: null,
      perlasEnabled: false,
    });
    expect(html).toContain('Užrezervuota');
    expect(html).not.toContain('Laukiama apmokėjimo');
    expect(html).not.toContain('Apmokėti dabar');
  });

  it('omits the per-lesson reminder note for a monthly recurring booking', async () => {
    const html = await preview('recurring_booking_confirmation', {
      forPayer: true,
      bookedBy: 'org_admin',
      studentName: 'Mokinys',
      payerName: 'Tėvas',
      tutorName: 'Mokytojas',
      totalLessons: 1,
      sessions: [{ date: '2026-10-01', time: '16:00' }],
      paymentReminderNote: false,
    });
    expect(html).not.toContain('Mokėjimo priminimas bus atsiųstas');
  });
});
