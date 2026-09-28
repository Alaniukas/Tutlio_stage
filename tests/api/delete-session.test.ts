import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'tutor-1', authError: false, admin: null as any,
  tables: {} as Record<string, Array<Record<string, any>>>,
  tableErrors: {} as Record<string, unknown>,
  rpc: vi.fn(), release: vi.fn(), google: vi.fn(),
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]>; range?: [number, number] }>,
}));

function builder(table: string) {
  const query = { table, filters: [] as Array<[string, unknown]>, range: undefined as [number, number] | undefined };
  state.queries.push(query);
  const filters: Array<(row: Record<string, any>) => boolean> = [];
  let limit: number | undefined;
  const value = () => {
    let rows = (state.tables[table] || []).filter((row) => filters.every((predicate) => predicate(row)));
    if (query.range) rows = rows.slice(query.range[0], query.range[1] + 1);
    if (limit !== undefined) rows = rows.slice(0, limit);
    return { data: rows, error: state.tableErrors[table] || null };
  };
  const api: any = {
    select: () => api,
    eq(column: string, expected: unknown) {
      query.filters.push([column, expected]); filters.push((row) => row[column] === expected); return api;
    },
    gte(column: string, expected: string) {
      query.filters.push([`${column}>=`, expected]); filters.push((row) => Date.parse(row[column]) >= Date.parse(expected)); return api;
    },
    order: () => api,
    range(start: number, end: number) { query.range = [start, end]; return api; },
    limit(count: number) { limit = count; return api; },
    maybeSingle: () => {
      const result = value();
      return Promise.resolve({ data: result.error ? null : result.data[0] || null, error: result.error });
    },
    then: (resolve: (result: any) => any, reject?: (reason: any) => any) => Promise.resolve(value()).then(resolve, reject),
  };
  return api;
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: builder, rpc: state.rpc,
  auth: { getUser: async () => ({ data: { user: state.authError ? null : { id: state.userId } }, error: state.authError ? {} : null }) },
}) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.admin }));
vi.mock('../../api/_lib/release-session-availability.js', () => ({
  releaseSessionSlotAsAvailability: state.release,
  sessionInstantToAvailabilityFields: (start: string) => ({ specificDate: start.slice(0, 10) }),
}));
vi.mock('../../api/_lib/google-calendar.js', () => ({ deleteSessionFromGoogle: state.google }));

import handler from '../../api/delete-session';

function lesson(patch: Record<string, any> = {}) {
  return { id: 'session-1', tutor_id: 'tutor-1', student_id: 'student-1', subject_id: 'subject-1',
    start_time: '2030-01-04T10:00:00Z', end_time: '2030-01-04T11:00:00Z', status: 'active',
    lesson_package_id: null, meeting_link: 'https://meet.example/lesson', google_calendar_event_id: 'google-1',
    recurring_session_id: null, class_group_id: null, student_joined_at: null, tutor_joined_at: null,
    cancellation_penalty_amount: 0, penalty_resolution: null, ...patch };
}

async function run(body: unknown = { sessionId: 'session-1', deleteScope: 'single' }, headers: Record<string, string> = { authorization: 'Bearer token' }) {
  const result = { status: 0, body: null as any };
  const response: any = { setHeader: vi.fn(), status(code: number) { result.status = code; return response; },
    send(text: string) { result.body = JSON.parse(text); return response; } };
  await handler({ method: 'POST', headers, body } as any, response);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks(); state.userId = 'tutor-1'; state.authError = false; state.admin = null; state.queries = []; state.tableErrors = {};
  state.tables = { sessions: [lesson()], profiles: [{ id: 'tutor-1', organization_id: 'org-1' }, { id: 'tutor-2', organization_id: 'org-1' }],
    students: [{ id: 'student-1', linked_user_id: 'student-user', parent_user_id: 'direct-parent' }],
    parent_profiles: [{ id: 'parent-profile', user_id: 'linked-parent' }], parent_students: [{ id: 'link', parent_id: 'parent-profile', student_id: 'student-1' }],
    school_class_groups: [{ id: 'group-1', tutor_id: 'tutor-1', organization_id: 'org-1' }] };
  state.release.mockResolvedValue({ created: true }); state.google.mockResolvedValue(undefined);
  state.rpc.mockImplementation(async (_name, args) => ({ data: state.tables.sessions.filter((row) => args.p_session_ids.includes(row.id)), error: null }));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://unit.example'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unit-key');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('authorized lesson deletion', () => {
  it('restores a tutor lesson slot and then deletes its Google snapshot only after a successful transaction', async () => {
    expect(await run()).toMatchObject({ status: 200, body: { deletedCount: 1, deletedSessionIds: ['session-1'] } });
    expect(state.release).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tutorId: 'tutor-1',
      startTime: '2030-01-04T10:00:00Z', endTime: '2030-01-04T11:00:00Z', subjectId: 'subject-1',
      meetingLink: 'https://meet.example/lesson', ignoredSessionIds: ['session-1'] }));
    expect(state.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(state.release.mock.invocationCallOrder[0]);
    expect(state.google).toHaveBeenCalledWith('session-1', 'tutor-1', 'google-1');
    expect(state.google.mock.invocationCallOrder[0]).toBeGreaterThan(state.rpc.mock.invocationCallOrder[0]);
  });

  it('allows Pro Klase tutors and organization session editors, but rejects view-only and other organizations', async () => {
    state.tables.profiles[0].organization_id = 'b0a00000-7e57-4000-8000-000000000001';
    expect((await run()).status).toBe(200);
    state.userId = 'admin-user'; state.tables.profiles[0].organization_id = 'org-1';
    for (const admin of [
      { organizationId: 'org-1', role: 'custom', permissions: { 'sessions.view': true } },
      { organizationId: 'other', role: 'owner', permissions: {} },
    ]) { state.admin = admin; expect((await run()).status).toBe(403); }
    state.admin = { organizationId: 'org-1', role: 'custom', permissions: { 'sessions.edit': true } };
    expect((await run()).status).toBe(200);
  });

  it('does not let a stale used invite override a tutor who moved to another organization', async () => {
    state.userId = 'admin-user'; state.admin = { organizationId: 'org-1', role: 'owner', permissions: {} };
    state.tables.profiles[0].organization_id = 'org-2';
    state.tables.tutor_invites = [{ used_by_profile_id: 'tutor-1', organization_id: 'org-1' }];
    expect((await run()).status).toBe(403); expect(state.rpc).not.toHaveBeenCalled();
  });

  it('does not grant organization deletion from a stale invite when current tutor lookup fails', async () => {
    state.userId = 'admin-user'; state.admin = { organizationId: 'org-1', role: 'owner', permissions: {} };
    state.tables.tutor_invites = [{ used_by_profile_id: 'tutor-1', organization_id: 'org-1' }];
    state.tableErrors.profiles = { code: '08006', message: 'Database unavailable' };
    expect((await run()).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.release).not.toHaveBeenCalled();
  });

  it('requires a recurrence choice and validates unsupported scopes and malformed input', async () => {
    state.tables.sessions[0].recurring_session_id = 'recurring-1';
    expect(await run({ sessionId: 'session-1' })).toMatchObject({ status: 409, body: { code: 'recurring_scope_required' } });
    expect((await run({ sessionId: 'session-1', deleteScope: 'everything' })).status).toBe(400);
    expect((await run('{')).status).toBe(400); expect((await run(null)).status).toBe(400);
    expect((await run(undefined, {})).status).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
  });

  it('deletes all planned and cancelled individual rows while retaining completed, no-show and joined history', async () => {
    const base = lesson({ recurring_session_id: 'recurring-1', status: 'cancelled' });
    state.tables.sessions = [base, { ...base, id: 'cancelled-earlier', start_time: '2020-01-01T10:00:00Z' },
      { ...base, id: 'active-future', status: 'active' }, { ...base, id: 'completed', status: 'completed' },
      { ...base, id: 'no-show', status: 'no_show' }, { ...base, id: 'joined', status: 'active', tutor_joined_at: '2030-01-04T09:59:00Z' },
      { ...base, id: 'active-past', status: 'active', start_time: '2020-01-01T10:00:00Z' }, { ...base, id: 'other-student', student_id: 'student-2' }];
    expect((await run({ sessionId: 'session-1', deleteScope: 'all' })).body.deletedSessionIds)
      .toEqual(['session-1', 'cancelled-earlier', 'active-future']);
    expect(state.rpc).toHaveBeenCalledWith('delete_sessions_with_recurrence', expect.objectContaining({
      p_deactivate_recurring_ids: ['recurring-1'], p_protect_history: true,
      p_exclusions: [{ recurring_session_id: 'recurring-1', class_group_id: null, student_id: 'student-1', scope: 'all', start_time: null }],
    }));
  });

  it('makes grouped single deletion explicit and defaults a removed member to their own row', async () => {
    state.tables.sessions = [lesson({ class_group_id: 'group-1', status: 'cancelled' }),
      lesson({ id: 'other-student', class_group_id: 'group-1', student_id: 'student-2' })];
    expect((await run()).body.deletedSessionIds).toEqual(['session-1']);
    expect((await run({ sessionId: 'session-1', deleteScope: 'single', groupScope: 'whole_occurrence' })).body.deletedSessionIds)
      .toEqual(['session-1', 'other-student']);
    expect(state.rpc.mock.calls.at(-1)?.[1].p_exclusions).toEqual([
      { recurring_session_id: null, class_group_id: 'group-1', student_id: null, scope: 'single', start_time: '2030-01-04T10:00:00Z' },
    ]);
  });

  it('blocks the old teacher from deleting the current teacher group schedule', async () => {
    state.tables.sessions = [lesson({ class_group_id: 'group-1' }), lesson({ id: 'new-teacher', class_group_id: 'group-1', tutor_id: 'tutor-2' })];
    state.tables.school_class_groups[0].tutor_id = 'tutor-2';
    expect((await run({ sessionId: 'session-1', deleteScope: 'all', groupScope: 'whole_occurrence' })).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('allows both parent links and the student to remove only their own cancelled group rows', async () => {
    state.tables.sessions = [lesson({ class_group_id: 'group-1', status: 'cancelled' }),
      lesson({ id: 'own-active', class_group_id: 'group-1' }), lesson({ id: 'other-child', class_group_id: 'group-1', student_id: 'student-2', status: 'cancelled' })];
    for (const userId of ['student-user', 'direct-parent', 'linked-parent']) {
      state.userId = userId;
      expect((await run({ sessionId: 'session-1', deleteScope: 'all', groupScope: 'whole_occurrence' })).body.deletedSessionIds)
        .toEqual(['session-1']);
      expect(state.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_family_only: true, p_deactivate_recurring_ids: [],
        p_exclusions: [{ recurring_session_id: null, class_group_id: 'group-1', student_id: 'student-1', scope: 'single', start_time: '2030-01-04T10:00:00Z' }] });
      expect((await run({ sessionId: 'own-active', deleteScope: 'single' })).status).toBe(403);
    }
    state.userId = 'unrelated-parent'; expect((await run()).status).toBe(403);
  });

  it('keeps an unfinished family refund or penalty even when the penalty amount is zero', async () => {
    state.userId = 'student-user'; state.tables.sessions[0].status = 'cancelled';
    state.tables.sessions[0].penalty_resolution = 'pending';
    expect(await run()).toMatchObject({ status: 409, body: { code: 'unsettled_cancellation_charge' } });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('blocks provisional cancellation deletion for tutors/admins and skips it in a series cleanup', async () => {
    state.tables.sessions[0] = lesson({ status: 'cancelled', penalty_resolution: 'pending', cancellation_penalty_amount: null });
    expect(await run()).toMatchObject({ status: 409, body: { code: 'cancellation_in_progress' } });
    state.userId = 'admin-user'; state.admin = { organizationId: 'org-1', role: 'owner', permissions: {} };
    expect((await run()).status).toBe(409); expect(state.rpc).not.toHaveBeenCalled();
    state.tables.sessions[0].recurring_session_id = 'recurring-1';
    state.tables.sessions.push(lesson({ id: 'settled', recurring_session_id: 'recurring-1', status: 'cancelled' }));
    expect((await run({ sessionId: 'session-1', deleteScope: 'all' })).body.deletedSessionIds).toEqual(['settled']);
  });

  it('loads the complete school-year group beyond the default 1000-row limit', async () => {
    const base = lesson({ class_group_id: 'group-1', status: 'cancelled' });
    state.tables.sessions = Array.from({ length: 1003 }, (_, index) => ({ ...base, id: index ? `session-${index + 1}` : 'session-1' }));
    const result = await run({ sessionId: 'session-1', deleteScope: 'all', groupScope: 'whole_occurrence' });
    expect(result.body.deletedCount).toBe(1003);
    expect(state.queries.filter((query) => query.table === 'sessions' && query.range).map((query) => query.range))
      .toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(state.release).toHaveBeenCalledTimes(1);
  });

  it('keeps rows when restoration fails and skips Google changes on a failed database transaction', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.release.mockRejectedValueOnce(new Error('availability failed'));
    expect((await run()).status).toBe(500); expect(state.rpc).not.toHaveBeenCalled();
    state.release.mockResolvedValue({ created: true });
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    expect(await run()).toMatchObject({ status: 503, body: { code: 'session_delete_migration_required' } });
    expect(state.google).not.toHaveBeenCalled();
  });

  it('returns real expanded ids, completes Google cleanup, and reports a failure restoring only extra rows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const extra = lesson({ id: 'newly-generated', start_time: '2030-01-11T10:00:00Z', end_time: '2030-01-11T11:00:00Z' });
    state.rpc.mockResolvedValueOnce({ data: [lesson(), extra], error: null });
    state.release.mockResolvedValueOnce({ created: true }).mockRejectedValueOnce(new Error('additional restore failed'));
    state.google.mockRejectedValueOnce(new Error('google failed'));
    expect(await run()).toMatchObject({ status: 200, body: { success: true, deletedSessionIds: ['session-1', 'newly-generated'], availabilityRestoreFailed: true } });
    expect(state.google).toHaveBeenCalledTimes(2);
  });
});
