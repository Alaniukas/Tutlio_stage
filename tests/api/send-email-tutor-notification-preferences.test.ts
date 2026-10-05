import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resend: vi.fn(),
  push: vi.fn(),
  skipParent: vi.fn(),
  skipTutor: vi.fn(),
  filterPersonal: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resend };
    constructor(_key: string) {}
  },
}));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: mocks.push }));
vi.mock('../../api/_lib/parentNotificationPreferences.js', () => ({
  shouldSkipParentNotification: mocks.skipParent,
  filterParentNotificationRecipients: async (_db: unknown, to: string[]) => to,
}));
vi.mock('../../api/_lib/userNotificationPreferences.js', () => ({ filterUserNotificationRecipients: mocks.filterPersonal }));
vi.mock('../../api/_lib/tutorNotificationPreferences.js', () => ({
  shouldSkipTutorNotification: mocks.skipTutor,
}));

import handler from '../../api/send-email';

function response() {
  const state: { statusCode: number; body: Record<string, unknown> | null } = {
    statusCode: 0,
    body: null,
  };
  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      state.body = body;
      return res;
    },
    setHeader() {
      return res;
    },
  };
  return { res, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key-test');
  vi.stubEnv('RESEND_API_KEY', 'resend-key-test');
  mocks.skipParent.mockResolvedValue(false);
  mocks.filterPersonal.mockImplementation(async (_db: unknown, to: string | string[]) => Array.isArray(to) ? to : [to]);
  mocks.skipTutor.mockResolvedValue(true);
  mocks.resend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  mocks.push.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('send-email tutor preferences', () => {
  it('honors personal opt-out before any provider or push call', async () => {
    mocks.filterPersonal.mockResolvedValue([]);
    const { res, state } = response();
    await handler({ method: 'POST', headers: { 'x-internal-key': 'service-key-test' }, query: {},
      body: { type: 'session_reminder', to: 'student@example.test', data: {}, locale: 'lt' } } as any, res);
    expect(state).toMatchObject({ statusCode: 200,
      body: { success: true, skipped: true, reason: 'user_notification_preference' } });
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('returns a successful skip before calling Resend', async () => {
    const { res, state } = response();
    await handler({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' },
      query: {},
      body: {
        type: 'org_tutor_availability_notice',
        to: 'ausra@example.com',
        data: { action: 'created', tutorName: 'Aušra', scheduleSummaryHtml: 'Trečiadienį 17:00' },
        locale: 'lt',
      },
    } as any, res);

    expect(state).toMatchObject({
      statusCode: 200,
      body: { success: true, skipped: true, reason: 'tutor_notification_preference' },
    });
    expect(mocks.skipTutor).toHaveBeenCalledWith(
      expect.anything(),
      'ausra@example.com',
      'org_tutor_availability_notice',
    );
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});
