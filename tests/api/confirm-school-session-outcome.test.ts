import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userId: 'admin', admin: null as any, session: null as any, entityType: 'school', writes: [] as any[], conflict: false, emptyRepresentation: false,
  move: vi.fn(), refund: vi.fn(), clearWaitlist: vi.fn(), sync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null }, error: null }) },
  from(table: string) {
    let patch: any;
    const query: any = { select: () => query, eq: () => query, is: () => query,
      update: (value: any) => { patch = value; return query; },
      maybeSingle: async () => {
        if (table === 'sessions' && patch) {
          if (state.conflict) return { data: null, error: null };
          state.writes.push(patch); Object.assign(state.session, patch);
          return { data: state.emptyRepresentation ? null : { id: state.session.id }, error: null };
        }
        return { data: table === 'sessions' ? { ...state.session } : table === 'profiles' ? { organization_id: 'org' } : { entity_type: state.entityType }, error: null };
      },
    };
    return query;
  },
}) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.admin }));
vi.mock('../../api/_lib/google-calendar.js', () => ({ syncSessionToGoogle: state.sync }));
vi.mock('../../api/_lib/sessionStatusConfirmation.js', () => ({ movePackageCountersToCompleted: state.move, returnPackageCounterToAvailable: state.refund, deleteSessionWaitlists: state.clearWaitlist }));
import handler from '../../api/confirm-session-status';

async function run(body: Record<string, unknown> = { confirmExisting: true }) {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body: { sessionId: 'session', status: 'completed', ...body } } as any, response);
  return response;
}
beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  state.userId = 'admin'; state.admin = { organizationId: 'org', role: 'admin', permissions: { 'sessions.edit': true } };
  state.session = { id: 'session', tutor_id: 'teacher', status: 'completed', start_time: '2020-01-01T10:00:00Z', end_time: '2020-01-01T11:00:00Z', status_confirmed_at: null };
  state.entityType = 'school'; state.writes = []; state.conflict = false; state.emptyRepresentation = false;
  state.move.mockClear(); state.refund.mockClear(); state.clearWaitlist.mockClear(); state.sync.mockClear();
});

describe('explicit school historical outcome confirmation', () => {
  it('allows an authorized admin to attest an existing outcome without repeating billing/package side effects', async () => {
    expect((await run()).status).toHaveBeenCalledWith(200);
    expect(state.writes).toEqual([{ status: 'completed', status_confirmed_at: expect.any(String), status_confirmed_by: 'admin' }]);
    expect(state.move).not.toHaveBeenCalled(); expect(state.refund).not.toHaveBeenCalled();
    expect(state.clearWaitlist).not.toHaveBeenCalled(); expect(state.sync).not.toHaveBeenCalled();
  });
  it('never stamps an older outcome without the explicit confirmExisting request', async () => {
    expect((await run({})).status).toHaveBeenCalledWith(409); expect(state.writes).toHaveLength(0);
  });
  it('rejects students, view-only admins and administrators of another organization', async () => {
    for (const admin of [null, { organizationId: 'org', role: 'custom', permissions: { 'sessions.view': true, 'sessions.edit': false } }, { organizationId: 'other', role: 'owner', permissions: {} }]) {
      state.admin = admin;
      expect((await run()).status).toHaveBeenCalledWith(403);
    }
    expect(state.writes).toHaveLength(0);
  });
  it('allows the assigned teacher, but not non-school historical attestations', async () => {
    state.userId = 'teacher'; state.admin = null;
    expect((await run()).status).toHaveBeenCalledWith(200);
    state.session.status_confirmed_at = null; state.entityType = 'company'; state.writes = [];
    expect((await run()).status).toHaveBeenCalledWith(409); expect(state.writes).toHaveLength(0);
  });
  it('rejects future or invalid end times and status rewrites', async () => {
    for (const end_time of ['2999-01-01T11:00:00Z', null, 'invalid']) {
      state.session.end_time = end_time;
      expect((await run()).status).toHaveBeenCalledWith(409);
    }
    state.session.end_time = '2020-01-01T11:00:00Z';
    expect((await run({ confirmExisting: true, status: 'no_show' })).status).toHaveBeenCalledWith(409);
    expect(state.writes).toHaveLength(0);
  });
  it('preserves the first attesting actor and timestamp on repeat confirmation', async () => {
    state.session.status_confirmed_at = '2020-01-02T11:00:00Z';
    expect((await run()).json).toHaveBeenCalledWith(expect.objectContaining({ alreadyConfirmed: true, statusConfirmedAt: '2020-01-02T11:00:00Z' }));
    expect(state.writes).toHaveLength(0);
  });
  it('does not repeat side effects if the row changes between reading and writing', async () => {
    state.session.status = 'active'; state.conflict = true;
    expect((await run()).status).toHaveBeenCalledWith(409);
    expect(state.move).not.toHaveBeenCalled(); expect(state.sync).not.toHaveBeenCalled();
  });
  it('keeps the existing active-session transition and its one-time side effects', async () => {
    state.session.status = 'active';
    expect((await run({})).status).toHaveBeenCalledWith(200);
    expect(state.move).toHaveBeenCalledTimes(1); expect(state.clearWaitlist).toHaveBeenCalledTimes(1);
  });
  it('verifies a persisted update when PostgREST returns an empty representation', async () => {
    state.emptyRepresentation = true; state.session.status = 'active';
    expect((await run({})).status).toHaveBeenCalledWith(200);
    expect(state.move).toHaveBeenCalledTimes(1);
  });
});
