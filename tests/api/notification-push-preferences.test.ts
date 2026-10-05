import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ deliver: vi.fn(), table: vi.fn(), enabled: false }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: state.deliver } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: (table: string) => {
    state.table(table);
    const query: any = { select: () => query, eq: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { enabled: state.enabled }, error: null }),
    };
    return query;
  },
}) }));
beforeEach(() => {
  state.table.mockClear(); state.deliver.mockClear(); state.enabled = false;
  vi.stubEnv('VAPID_PUBLIC_KEY', 'synthetic-public'); vi.stubEnv('VAPID_PRIVATE_KEY', 'synthetic-private');
  vi.stubEnv('SUPABASE_URL', 'https://synthetic.invalid'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service');
});
afterEach(() => vi.unstubAllEnvs());
it('does not look up devices or deliver direct chat push when messages are disabled', async () => {
  const { sendPushForUserId } = await import('../../api/_lib/sendPush');
  expect(await sendPushForUserId('user', 'chat_new_message', { preview: 'Message' })).toBe(0);
  expect(state.table.mock.calls.map(row => row[0])).toEqual(['user_notification_preferences']);
  expect(state.deliver).not.toHaveBeenCalled();
});
