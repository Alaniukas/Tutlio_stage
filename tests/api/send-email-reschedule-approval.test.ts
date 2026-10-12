// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), org: {} as any }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('../../api/_lib/sendPush.js', () => ({ sendPushForEmail: async () => {} }));
vi.mock('../../api/_lib/userNotificationPreferences.js', () => ({ filterUserNotificationRecipients: async (_db: unknown, to: any) => Array.isArray(to) ? to : [to] }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'tutor-user' } }, error: null }) },
  from(table: string) {
    const result = () => ({ data: table === 'organizations' ? mocks.org : null, error: null });
    const q: any = { select: () => q, eq: () => q, in: () => q, is: () => q, not: () => q, limit: () => q,
      maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => resolve(result()) };
    return q;
  },
}) }));
import handler from '../../api/send-email';
const requestId = '00000000-0000-4000-8000-000000000001';
const recipientId = '00000000-0000-4000-8000-000000000002';
function response() {
  const result: any = {};
  const res: any = { status: (status: number) => { result.status = status; return res; }, json: (body: any) => { result.body = body; return res; }, result };
  return res;
}
function body(type = 'lesson_reschedule_proposed', status = 'pending') {
  return { type, to: 'parent@example.com', data: {
    organizationId: 'target-org', tutorName: 'Rasa', studentName: 'Ona', scope: 'future', status,
    oldStart: '2030-10-22T10:00:00Z', oldEnd: '2030-10-22T11:00:00Z',
    newStart: '2030-10-23T12:00:00Z', newEnd: '2030-10-23T13:00:00Z', reason: 'Keičiamas darbo grafikas', locale: 'lt',
    confirmUrl: 'https://tutlio.lt/lesson-reschedule-approval?choice=approved',
    rejectUrl: 'https://tutlio.lt/lesson-reschedule-approval?choice=rejected',
    rescheduleDeliveryKey: `reschedule/${requestId}/${type === 'lesson_reschedule_proposed' ? `proposal/${recipientId}` : `decision/${status}`}`,
  } };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-internal-key');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  mocks.send.mockResolvedValue({ data: { id: 'provider-confirmation' }, error: null });
  mocks.org = { id: 'target-org', name: 'Kita organizacija', brand_color: '#123456', preferred_locale: 'lt',
    features: { custom_branding: true, public_name: 'Tikslinė organizacija', email_team_signature: 'Tikslinė komanda', contact_email: 'office@target.example' } };
});
afterEach(() => vi.unstubAllEnvs());
describe('reschedule approval email delivery', () => {
  it('uses the target organization branding and both approval links', async () => {
    const res = response();
    await handler({ method: 'POST', headers: { 'x-internal-key': 'test-internal-key' }, body: body() } as any, res);
    expect(res.result.status).toBe(200);
    expect(res.result.body.id).toBe('provider-confirmation');
    const [email, options] = mocks.send.mock.calls[0];
    expect(email.html).toContain('Tikslinė organizacija');
    expect(email.html).not.toContain('Mokslo vaisiai');
    expect(email.html).toContain('Patvirtinti');
    expect(email.html).toContain('Nepatvirtinti');
    expect(email.html).toContain('choice=approved');
    expect(email.html).toContain('choice=rejected');
    expect(options.idempotencyKey).toBe(body().data.rescheduleDeliveryKey);
  });
  it('tells the tutor to contact the administration after rejection', async () => {
    const res = response();
    await handler({ method: 'POST', headers: { 'x-internal-key': 'test-internal-key' }, body: body('lesson_reschedule_decision', 'rejected') } as any, res);
    expect(res.result.status).toBe(200);
    expect(mocks.send.mock.calls[0][0].html).toContain('Dėl pamokos perkėlimo kreipkitės į administraciją');
  });
  it('does not let an ordinary authenticated user send approval capabilities', async () => {
    const res = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: body() } as any, res);
    expect(res.result.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('recognizes a delivered provider key when retrying after branding changes', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { statusCode: 409, name: 'invalid_idempotent_request' } });
    const res = response();
    await handler({ method: 'POST', headers: { 'x-internal-key': 'test-internal-key' }, body: body('lesson_reschedule_decision', 'rejected') } as any, res);
    expect(res.result.status).toBe(200);
    expect(res.result.body).toMatchObject({ success: true, skipped: true });
  });
});
