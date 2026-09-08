import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  edit: true, admin: true, student: false, rpc: vi.fn(), materialize: vi.fn(),
}));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => ({ userId: 'user' }) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: async (_r: unknown, _s: unknown, permission: string) =>
  state.admin && (permission === 'sessions.view' || state.edit)
    ? { ok: true, access: { organizationId: 'org' } } : { ok: false, status: 403, error: 'Forbidden' },
}));
vi.mock('../../api/_lib/schoolClassGroupMaterialize.js', () => ({ materializeClassGroupNow: state.materialize, removeFutureClassGroupSessions: vi.fn() }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => ({
  rpc: state.rpc,
  from(table: string) {
    const data = table === 'profiles' ? { id: 'tutor', organization_id: 'org' }
      : table === 'school_class_groups' ? { id: 'group', tutor_id: 'tutor' } : null;
    const rows = table === 'students' && state.student ? [{ id: 's1' }]
      : table === 'school_class_group_members' ? [{ student_id: 's1', group_id: 'group', schedule_slots: null }]
      : table === 'school_class_groups' ? [{ id: 'group', tutor_id: 'tutor', members: [{ student_id: 's1' }, { student_id: 'other', student: { email: 'private@example.test' } }] }] : [];
    const q: any = { select: () => q, eq: () => q, in: () => q, order: () => q,
      maybeSingle: async () => ({ data, error: null }), then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve) };
    return q;
  },
}) }));
import handler from '../../api/school-class-groups';
const body = { id: 'group', name: 'German', tutor_id: 'tutor', school_year_start: '2026-09-01', school_year_end: '2027-06-01', duration_minutes: 60,
  slots: [{ weekday: 1, start_time: '16:00' }, { weekday: 3, start_time: '16:00' }, { weekday: 5, start_time: '16:00' }],
  student_ids: ['s1'], member_schedules: { s1: [{ weekday: 1, start_time: '16:00' }, { weekday: 3, start_time: '16:00' }] } };
async function call(method = 'PATCH') {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method, body, query: {} } as any, res);
  return res;
}
describe('school group atomic save API', () => {
  beforeEach(() => { vi.clearAllMocks(); state.edit = true; state.admin = true; state.student = false;
    state.rpc.mockResolvedValue({ data: { id: 'group' }, error: null }); state.materialize.mockResolvedValue({ inserted: 2 }); });
  it('saves all group times and the pupil subset in one transaction before materializing', async () => {
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(state.rpc).toHaveBeenCalledOnce();
    const payload = state.rpc.mock.calls[0][1];
    expect(payload.p_organization_id).toBe('org');
    expect(payload.p_slots.map((s: any) => s.weekday)).toEqual([1,3,5]);
    expect(payload.p_members[0].schedule_slots.map((s: any) => s.weekday)).toEqual([1,3]);
    expect(state.materialize).toHaveBeenCalledOnce();
  });
  it('does not materialize or report success after a transaction failure', async () => {
    state.rpc.mockResolvedValue({ error: { code: '22023', message: 'Student is not in this organization' } });
    const res = await call(); expect(res.status).toHaveBeenCalledWith(400); expect(state.materialize).not.toHaveBeenCalled();
  });
  it.each(['POST','PATCH'])('denies a view-only administrator %s writes', async method => {
    state.edit = false; const res = await call(method);
    expect(res.status).toHaveBeenCalledWith(403); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('newly provisioned students see their groups without other children contacts', async () => {
    state.admin = false; state.student = true;
    const res = await call('GET');
    expect(res.json).toHaveBeenCalledWith({ groups: [{ id: 'group', tutor_id: 'tutor', members: [{ student_id: 's1' }] }] });
  });
  it('does not treat a provisioned student profile as permission to create teacher groups', async () => {
    state.admin = false; state.student = true;
    const res = await call('POST');
    expect(res.status).toHaveBeenCalledWith(403); expect(state.rpc).not.toHaveBeenCalled();
  });
});
