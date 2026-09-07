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

describe('Thai payment reminder preview', () => {
  it.each([
    { paymentTiming: 'before_lesson', hours: 24, recipientName: 'ผู้ปกครอง', timingText: '24 ชั่วโมงก่อนคาบเรียน' },
    { paymentTiming: 'after_lesson', hours: 2, recipientName: '<b>Ana</b>', timingText: '2 ชั่วโมงหลังคาบเรียน' },
  ])('renders the $paymentTiming deadline without sending an email', async ({ paymentTiming, hours, recipientName, timingText }) => {
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
        type: 'payment_reminder', to: 'payer@example.com', locale: 'th', dryRun: true,
        data: { studentName: '<b>Ana</b>', recipientName, tutorName: 'Tutor',
          date: '2026-09-01', time: '16:30', price: 25, deadlineHours: hours,
          paymentTiming, paymentUrl: 'https://example.com/pay/123' },
      },
    } as never, response as never);
    expect(statusCode).toBe(200);
    expect(payload?.html).toContain('<html lang="th" dir="ltr">');
    expect(payload?.html).toContain('กำหนดชำระเงิน');
    expect(payload?.html).toContain(timingText);
    expect(payload?.html).toContain(recipientName === 'ผู้ปกครอง'
      ? 'นักเรียน <strong>&lt;b&gt;Ana&lt;/b&gt;</strong> ยังไม่ได้ชำระค่าคาบเรียน'
      : 'คุณยังไม่ได้ชำระค่าคาบเรียน');
    expect(payload?.html).not.toContain('<b>Ana</b>');
    expect(payload?.html).toContain('https://example.com/pay/123');
    expect(payload?.html).toContain('25');
    expect(payload?.html).not.toMatch(/\{(?:hours|timing|student)\}/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
