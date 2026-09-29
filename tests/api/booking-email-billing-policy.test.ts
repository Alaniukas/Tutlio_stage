import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  model: null as string | null,
  monthly: true,
  orgMissing: false,
  send: vi.fn(),
}));

vi.mock('resend', () => ({ Resend: class { emails = { send: state.send }; } }));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const rows = table === 'sessions' ? [{ student_id: 'student-1', tutor_id: 'tutor-1' }]
        : table === 'students' ? [{ payment_model: state.model }]
          : table === 'profiles' ? [{ organization_id: 'org-1', enable_per_lesson: true, enable_monthly_billing: false }]
            : table === 'organizations' && !state.orgMissing
              ? [{ enable_per_lesson: true, enable_monthly_billing: state.monthly }]
              : [];
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      };
      return query;
    },
  }),
}));

import handler from '../../api/send-email';

beforeEach(() => {
  vi.clearAllMocks();
  state.model = null;
  state.monthly = true;
  state.orgMissing = false;
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
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
  expect(state.send).not.toHaveBeenCalled();
  return html;
}

describe('booking email server-side monthly billing policy', () => {
  it('strips stale pending status and payment button for an inherited monthly lesson', async () => {
    const html = await preview('booking_confirmation', {
      sessionId: 'session-1', forPayer: true, studentName: 'Mokinys', tutorName: 'Mokytojas',
      date: '2026-10-01', time: '16:00', price: 25,
      paymentStatus: 'pending', paymentLink: 'https://tutlio.lt/pay-stale', perlasEnabled: true,
    });
    expect(html).toContain('Užrezervuota');
    expect(html).not.toContain('Laukiama apmokėjimo');
    expect(html).not.toContain('pay-stale');
    expect(html).not.toContain('Apmokėti dabar');
  });

  it('strips a stale recurring payment reminder note when org policy cannot be loaded', async () => {
    state.orgMissing = true;
    const html = await preview('recurring_booking_confirmation', {
      sessionId: 'session-1', forPayer: true, studentName: 'Mokinys', tutorName: 'Mokytojas',
      totalLessons: 1, sessions: [{ date: '2026-10-01', time: '16:00' }], paymentReminderNote: true,
    });
    expect(html).not.toContain('Mokėjimo priminimas bus atsiųstas');
  });

  it('retains per-lesson payment copy for an explicitly per-lesson student', async () => {
    state.model = 'per_lesson';
    const html = await preview('booking_confirmation', {
      sessionId: 'session-1', forPayer: true, studentName: 'Mokinys', tutorName: 'Mokytojas',
      date: '2026-10-01', time: '16:00', price: 25,
      paymentStatus: 'pending', paymentLink: 'https://tutlio.lt/pay-legitimate',
    });
    expect(html).toContain('Laukiama apmokėjimo');
    expect(html).toContain('pay-legitimate');
  });
});
