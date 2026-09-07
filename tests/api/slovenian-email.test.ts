import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: vi.fn() }));
import handler from '../../api/send-email';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service');
});
afterEach(() => vi.unstubAllEnvs());

describe('Slovenian payment reminder preview', () => {
  it.each([
    { paymentTiming: 'before_lesson', hours: 24, recipientName: 'Starš', timingText: '24 h pred začetkom ure' },
    { paymentTiming: 'after_lesson', hours: 2, recipientName: '<b>Jan</b>', timingText: '2 h po koncu ure' },
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
        type: 'payment_reminder', to: 'payer@example.com', locale: 'sl', dryRun: true,
        data: { studentName: '<b>Jan</b>', recipientName, tutorName: 'Inštruktor',
          date: '2026-09-01', time: '16:30', price: 25, deadlineHours: hours,
          paymentTiming, paymentUrl: 'https://example.com/pay/123' },
      },
    } as never, response as never);
    expect(statusCode).toBe(200);
    expect(payload?.html).toContain('<html lang="sl" dir="ltr">');
    expect(payload?.html).toContain('Rok plačila');
    expect(payload?.html).toContain(timingText);
    expect(payload?.html).toContain(recipientName === 'Starš'
      ? 'Učenec <strong>&lt;b&gt;Jan&lt;/b&gt;</strong> ure še ni plačal.'
      : 'Ure še niste plačali.');
    expect(payload?.html).not.toContain('<b>Jan</b>');
    expect(payload?.html).toContain('https://example.com/pay/123');
    expect(payload?.html).toContain('25');
    expect(payload?.html).not.toMatch(/\{(?:hours|timing|student)\}/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
