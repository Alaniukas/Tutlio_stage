import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
  send: vi.fn(),
}));

vi.mock('../../api/_lib/findAuthUserByEmail.js', () => ({ findAuthUserByEmail: mocks.find }));
vi.mock('../../api/_lib/resendConfig.js', () => ({
  getResendApiKey: () => 'test-key',
  getFromEmail: () => 'test@example.test',
}));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));

import { sendStudentUsernameRecovery } from '../../api/_lib/studentUsernameRecovery';

const authEmail = 'mv-0123456789abcdef@student-login.tutlio.invalid';
const redirect = 'https://tutlio.lt/auth/callback?next=/reset-password';
const db = {
  auth: { admin: {
    getUserById: mocks.get,
    updateUserById: mocks.update,
    generateLink: mocks.generate,
  } },
} as any;
const user = {
  id: 'child',
  email: authEmail,
  email_confirmed_at: '2026-09-08',
  user_metadata: { full_name: 'Child' },
  app_metadata: {
    provisioned_by_organization: 'c1f36796-c281-4650-bed2-1bd6874764f1',
    student_login_name: 'mv-0123456789abcdef',
    student_contact_email: 'parent@example.test',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({ id: 'child' });
  mocks.get.mockResolvedValue({ data: { user } });
  mocks.update.mockResolvedValue({ error: null });
  mocks.generate.mockResolvedValue({
    data: { properties: { action_link: 'https://auth.example.test/recovery' } },
  });
  mocks.send.mockResolvedValue({ error: null });
});

describe('student username password recovery', () => {
  it('generates recovery for the child and sends only to the server-stored parent contact', async () => {
    await sendStudentUsernameRecovery(db, authEmail, redirect);
    expect(mocks.generate).toHaveBeenCalledWith({
      type: 'recovery',
      email: authEmail,
      options: { redirectTo: redirect },
    });
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: 'parent@example.test' });
    expect(mocks.send.mock.calls[0][0].html).not.toContain('student-login.tutlio.invalid');
    expect(mocks.update.mock.calls[0][0]).toBe('child');
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('password');
  });

  it.each(['missing', 'inactive', 'foreign', 'throttled', 'mismatched'])('does not send recovery for %s accounts', async (state) => {
    if (state === 'missing') mocks.find.mockResolvedValue(null);
    else mocks.get.mockResolvedValue({ data: { user: {
      ...user,
      email_confirmed_at: state === 'inactive' ? null : user.email_confirmed_at,
      app_metadata: {
        ...user.app_metadata,
        ...(state === 'foreign' ? { provisioned_by_organization: 'other' } : {}),
        ...(state === 'throttled' ? { student_recovery_sent_at: Date.now() } : {}),
        ...(state === 'mismatched' ? { student_login_name: 'mv-ffffffffffffffff' } : {}),
      },
    } } });
    await sendStudentUsernameRecovery(db, authEmail, redirect);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
