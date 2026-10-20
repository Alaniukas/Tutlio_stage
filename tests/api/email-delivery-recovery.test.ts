import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendRedirectedEmailRecovery } from '../../api/_lib/emailDeliveryRecovery';

const mocks = vi.hoisted(() => ({ send: vi.fn(), get: vi.fn(), generate: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
const parentEmail = 'parent@retired.example';
const inbox = 'family@example.test';
const input = { email: parentEmail, userId: 'original-parent-id',
  redirectTo: 'https://tutlio.lt/auth/callback?next=/reset-password', locale: 'lt' as const };
const db = { auth: { admin: { getUserById: mocks.get, generateLink: mocks.generate } } } as any;

beforeEach(() => {
  vi.stubEnv('EMAIL_DELIVERY_REDIRECTS', JSON.stringify({ [parentEmail]: inbox }));
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '0');
  mocks.get.mockResolvedValue({ data: { user: { id: input.userId, email: parentEmail, recovery_sent_at: null } }, error: null });
  mocks.generate.mockResolvedValue({ data: { user: { id: input.userId }, properties: { action_link: 'https://auth.example.test/parent-recovery' } }, error: null });
  mocks.send.mockResolvedValue({ data: { id: 'recovery-email' }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('recovery with a separate delivery inbox', () => {
  it('generates recovery for the original parent account and sends it to the shared inbox', async () => {
    expect(await sendRedirectedEmailRecovery(db, input)).toBe(true);
    expect(mocks.generate).toHaveBeenCalledWith({ type: 'recovery', email: parentEmail, options: { redirectTo: input.redirectTo } });
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: inbox, subject: 'Tutlio — Atkurkite slaptažodį' });
    expect(mocks.send.mock.calls[0][0].html).toContain('https://auth.example.test/parent-recovery');
    // The student login at the destination is never queried, changed or recovered.
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(input.userId);
    expect(mocks.generate.mock.calls[0][0].email).not.toBe(inbox);
  });

  it('leaves the student account and ordinary recovery on the existing Supabase path', async () => {
    expect(await sendRedirectedEmailRecovery(db, { ...input, email: inbox, userId: 'student-id' })).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not expose unknown accounts or send to the retired address on a throttled request', async () => {
    expect(await sendRedirectedEmailRecovery(db, { ...input, userId: null })).toBe(true);
    mocks.get.mockResolvedValue({ data: { user: { id: input.userId, email: parentEmail, recovery_sent_at: new Date().toISOString() } }, error: null });
    expect(await sendRedirectedEmailRecovery(db, input)).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not deliver a link after an account change or mismatched recovery account', async () => {
    mocks.get.mockResolvedValueOnce({ data: { user: { email: 'changed@example.test' } }, error: null });
    await expect(sendRedirectedEmailRecovery(db, input)).rejects.toThrow('Recovery account changed');
    mocks.generate.mockResolvedValueOnce({ data: { user: { id: 'student-id' }, properties: { action_link: 'https://auth.example.test/wrong-account' } }, error: null });
    await expect(sendRedirectedEmailRecovery(db, input)).rejects.toThrow('Recovery link generation failed');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reports provider failure without ever falling back to Supabase delivery to the retired inbox', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'Provider unavailable' } });
    await expect(sendRedirectedEmailRecovery(db, input)).rejects.toThrow('Recovery email delivery was not confirmed');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
