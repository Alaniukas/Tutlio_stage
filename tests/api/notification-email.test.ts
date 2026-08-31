import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationLocale } from '../../api/_lib/notificationLocale';

const mocks = vi.hoisted(() => ({ from: vi.fn(), send: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: vi.fn() }));
import handler from '../../api/send-email';

const client = { from: mocks.from } as any;
function profile(locale: unknown, error: unknown = null) {
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => table === 'profiles'
      ? { data: { preferred_locale: locale }, error }
      : { data: { preferred_locale: 'ar', entity_type: 'company' }, error: null },
  }) }) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
});
afterEach(() => vi.unstubAllEnvs());

describe('automated notification language', () => {
  it('retains an explicit caller language without a database lookup', async () => {
    expect(await notificationLocale(client, 'person@example.com', 'pt-br', 'ar')).toBe('pt-br');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('uses the recipient preference before the organization default', async () => {
    profile('he');
    expect(await notificationLocale(client, 'person@example.com', undefined, 'ar')).toBe('he');
  });
  it('uses the organization for recipients without a valid profile preference', async () => {
    profile(null);
    expect(await notificationLocale(client, 'person@example.com', undefined, 'ar')).toBe('ar');
  });
  it('keeps delivery possible if preference lookup fails', async () => {
    profile(null, { message: 'database unavailable' });
    expect(await notificationLocale(client, 'person@example.com', undefined, 'it')).toBe('it');
  });
  it('does not assign one recipient’s language to a whole group', async () => {
    expect(await notificationLocale(client, ['one@example.com', 'two@example.com'], undefined, 'ar')).toBe('ar');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('renders an actual cancellation in the saved locale without sending it', async () => {
    profile('he');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await handler({
      method: 'POST', headers: { 'x-internal-key': 'test-only-service' }, query: {},
      body: { type: 'session_cancelled', to: 'person@example.com', dryRun: true,
        data: { organizationId: 'org-id', studentName: 'Student', tutorName: 'Tutor', date: '2026-09-01', time: '16:00', cancelledBy: 'tutor' } },
    } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].html).toContain('<html lang="he" dir="rtl">');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
