import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), push: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        limit: () => query,
        maybeSingle: async () => ({
          data: table === 'profiles' && filters.id === 'user-1'
            ? { organization_id: 'org-1' }
            : table === 'organizations'
              ? { name: 'Other Org', email: 'other@example.com', features: { contact_email: 'other-admin@example.com' } }
              : null,
          error: null,
        }),
      };
      return query;
    },
  }),
}));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('../../api/_lib/sendPush.js', () => ({ sendPushForEmail: mocks.push }));
vi.mock('../../api/_lib/parentNotificationPreferences.js', () => ({
  filterParentNotificationRecipients: async (_db: unknown, to: string[]) => to,
  shouldSkipParentNotification: async () => false,
}));
vi.mock('../../api/_lib/tutorNotificationPreferences.js', () => ({ shouldSkipTutorNotification: async () => false }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  mocks.send.mockResolvedValue({ data: { id: 'sent-id' }, error: null });
  mocks.push.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

async function sendForOrg(organizationId: string) {
  const { default: handler } = await import('../../api/send-email.js');
  const result = { status: 0, body: null as any };
  const res: any = {
    status(code: number) { result.status = code; return this; },
    json(body: unknown) { result.body = body; return this; },
    setHeader() { return this; },
  };
  await handler({
    method: 'POST', headers: { authorization: 'Bearer user-token' }, query: {},
    body: { type: 'session_cancelled', to: 'parent@example.com', locale: 'lt',
      data: { organizationId, studentName: 'Student', tutorName: 'Tutor', date: '2026-09-29', time: '14:00' } },
  } as any, res);

  return result;
}

it('does not use a browser-supplied organization ID to route replies across tenants', async () => {
  expect((await sendForOrg('org-2')).status).toBe(200);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('replyTo');
});

it('uses the verified organization for a browser-triggered email', async () => {
  expect((await sendForOrg('org-1')).status).toBe(200);
  expect(mocks.send.mock.calls[0][0].replyTo).toEqual(['other-admin@example.com']);
});
vi.mock('../../api/_lib/userNotificationPreferences.js', () => ({
  filterUserNotificationRecipients: async (_db: unknown, to: string | string[]) => Array.isArray(to) ? to : [to],
}));
