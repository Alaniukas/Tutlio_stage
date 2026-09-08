import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  profile: {} as any, sessions: [] as any[],
  auth: { userId: 'tutor' } as any, seat: null as any,
  sync: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => ({
  select: () => ({
    eq: () => ({ single: async () => ({ data: state.profile }), maybeSingle: async () => ({ data: state.sessions[0] }) }),
    in: async () => ({ data: state.sessions }),
  }),
}) }) }));
vi.mock('../../api/_lib/auth', () => ({ verifyRequestAuth: async () => state.auth }));
vi.mock('../../api/_lib/orgAdminAccess', () => ({ getOrgAdminSeatByUserId: async () => state.seat }));
vi.mock('../../api/_lib/google-calendar', () => ({ syncSessionToGoogle: state.sync, syncAllEventsToGoogle: vi.fn() }));
import handler from '../../api/google-calendar-sync';

async function request(body: any) {
  const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json: vi.fn() };
  await handler({ method: 'POST', body } as any, res);
  return res;
}
beforeEach(() => {
  state.auth = { userId: 'tutor' }; state.seat = null;
  state.profile = { organization_id: 'org', google_calendar_connected: true, google_calendar_sync_enabled: true, google_calendar_access_token: 'test' };
  state.sessions = [{ id: 'a', tutor_id: 'tutor' }, { id: 'b', tutor_id: 'tutor' }];
  state.sync.mockReset().mockResolvedValue({ success: true });
});
afterEach(() => vi.restoreAllMocks());

describe('Google Calendar batch endpoint', () => {
  it('syncs a validated batch once per distinct session', async () => {
    const res = await request({ userId: 'tutor', sessionIds: ['a', 'b', 'a'] });
    expect(res.statusCode).toBe(200);
    expect(state.sync.mock.calls).toEqual([['a', 'tutor'], ['b', 'tutor']]);
  });
  it.each([[], Array(11).fill('a'), [''], 'a'])('rejects invalid batches without writes', async (sessionIds) => {
    expect((await request({ userId: 'tutor', sessionIds })).statusCode).toBe(400);
    expect(state.sync).not.toHaveBeenCalled();
  });
  it('rejects another tutor anywhere in the batch before syncing even the first row', async () => {
    state.sessions[1].tutor_id = 'other';
    expect((await request({ userId: 'tutor', sessionIds: ['a', 'b'] })).statusCode).toBe(403);
    expect(state.sync).not.toHaveBeenCalled();
  });
  it('rejects a missing session before writing', async () => {
    state.sessions.pop();
    expect((await request({ userId: 'tutor', sessionIds: ['a', 'b'] })).statusCode).toBe(404);
    expect(state.sync).not.toHaveBeenCalled();
  });
  it('preserves authentication and organization boundaries', async () => {
    state.auth = null;
    expect((await request({ userId: 'tutor', sessionIds: ['a', 'b'] })).statusCode).toBe(401);
    state.auth = { userId: 'other-admin' };
    state.seat = { status: 'active', role: 'owner', organizationId: 'different-org' };
    expect((await request({ userId: 'tutor', sessionIds: ['a', 'b'] })).statusCode).toBe(403);
    expect(state.sync).not.toHaveBeenCalled();
  });
  it('reports real upstream failures and stops remaining work', async () => {
    state.sync.mockResolvedValue({ success: false, error: 'Google unavailable' });
    expect((await request({ userId: 'tutor', sessionIds: ['a', 'b'] })).statusCode).toBe(502);
    expect(state.sync).toHaveBeenCalledTimes(1);
  });
  it('retains the existing single-session request contract', async () => {
    expect((await request({ userId: 'tutor', sessionId: 'a' })).statusCode).toBe(200);
    expect(state.sync).toHaveBeenCalledWith('a', 'tutor');
  });
});
