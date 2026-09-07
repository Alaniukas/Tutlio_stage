import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), reset: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../../api/_lib/findAuthUserByEmail', () => ({ findAuthUserByEmail: mocks.findUser }));
import handler from '../../api/request-password-reset';

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
function request(locale: unknown, host = 'www.tutlio.com', redirectTo = `https://${host}/auth/callback?next=/reset-password&lang=${locale}`) {
  return { method: 'POST', headers: { host, origin: `https://${host}` }, body: { email: 'example@example.com', locale, redirectTo } } as any;
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service-key');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-only-anon-key');
  mocks.createClient.mockReturnValue({ auth: { admin: { updateUserById: mocks.updateUser }, resetPasswordForEmail: mocks.reset } });
  mocks.findUser.mockResolvedValue({ id: 'user-id', user_metadata: { full_name: 'Existing name', locale: 'en' } });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.reset.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('localized password recovery', () => {
  it.each(['he', 'ar', 'pt-br', 'it'])('sets %s before sending, without discarding other user metadata', async (locale) => {
    const req = request(locale);
    const res = response();
    await handler(req, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.updateUser).toHaveBeenCalledWith('user-id', { user_metadata: { full_name: 'Existing name', locale } });
    expect(mocks.reset).toHaveBeenCalledWith('example@example.com', { redirectTo: req.body.redirectTo });
    expect(mocks.updateUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.reset.mock.invocationCallOrder[0]);
  });

  it('keeps Polish-only behavior', async () => {
    await handler(request('he', 'www.tutlio.pl'), response() as any);
    expect(mocks.updateUser).toHaveBeenCalledWith('user-id', { user_metadata: { full_name: 'Existing name', locale: 'pl' } });
  });

  it('does not send a misleading-language email after a failed metadata update', async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: 'unavailable' } });
    const res = response();
    await handler(request('he'), res as any);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('rejects an untrusted redirect before updating a user or sending an email', async () => {
    const res = response();
    await handler(request('he', 'www.tutlio.com', 'https://evil.example/reset'), res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('keeps the same success response when the email is not registered', async () => {
    mocks.findUser.mockResolvedValue(null);
    const res = response();
    await handler(request('it'), res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
