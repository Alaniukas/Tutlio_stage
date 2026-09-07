import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: vi.fn() }));
import handler from '../../api/send-email';
import { sendEnterpriseWelcomeEmail } from '../../api/_lib/sendEnterpriseWelcomeEmail';
import { sendTutorInviteEmail } from '../../api/_lib/sendTutorInviteResend';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service');
  sendMock.mockResolvedValue({ data: { id: 'mock-email' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('Arabic transactional email rendering', () => {
  it('renders the payment reminder in RTL, escaping names and keeping the amount and link', async () => {
    let payload: any;
    let statusCode = 0;
    const res = {
      status(code: number) { statusCode = code; return this; },
      json(body: unknown) { payload = body; return this; },
      setHeader() { return this; },
    };
    await handler({
      method: 'POST', query: {}, headers: { 'x-internal-key': 'test-only-service' },
      body: {
        type: 'payment_reminder', to: 'payer@example.com', locale: 'ar', dryRun: true,
        data: { studentName: '<b>أحمد</b>', recipientName: 'ولي الأمر', tutorName: 'سارة',
          date: '2026-09-01', time: '16:30', price: 25, deadlineHours: 24,
          paymentTiming: 'before_lesson', paymentUrl: 'https://example.com/pay/123' },
      },
    } as any, res as any);
    expect(statusCode).toBe(200);
    expect(payload.html).toContain('<html lang="ar" dir="rtl">');
    expect(payload.html).toContain('<body dir="rtl"');
    expect(payload.html).toContain('&lt;b&gt;أحمد&lt;/b&gt;');
    expect(payload.html).not.toContain('<b>أحمد</b>');
    expect(payload.html).toContain('لم يدفع رسوم الدرس بعد.');
    expect(payload.html).toContain('25');
    expect(payload.html).toContain('https://example.com/pay/123');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('gives standalone business welcome and tutor invitations RTL envelopes', async () => {
    await sendEnterpriseWelcomeEmail('admin@example.com', {
      companyName: 'مؤسسة تجريبية', licenseCount: 3, setupLink: 'https://example.com/setup', locale: 'ar',
    });
    expect(sendMock.mock.calls[0][0].html).toContain('<html lang="ar" dir="rtl">');
    expect(sendMock.mock.calls[0][0].html).toContain('مؤسسة تجريبية');
    await sendTutorInviteEmail('tutor@example.com', {
      inviteToken: 'test-invite', orgName: 'مؤسسة تجريبية', inviteeName: 'سارة',
      inviteeEmail: 'tutor@example.com', origin: 'https://www.tutlio.com', emailLocale: 'ar', uiLocale: 'ar',
    });
    expect(sendMock.mock.calls[1][0].html).toContain('<html lang="ar" dir="rtl">');
    expect(sendMock.mock.calls[1][0].html).toContain('/ar/');
  });
});
