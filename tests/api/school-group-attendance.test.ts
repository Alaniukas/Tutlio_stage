import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userId: 'teacher', admin: null as any, tables: {} as Record<string, any[]>, writes: [] as string[], errors: {} as Record<string, any> }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId } : null }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.admin }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => fakeDb() }));
import handler from '../../api/school-group-attendance';
import { attendanceContractConfirmed, recordExistingSchoolAttendance } from '../../api/_lib/schoolGroupAttendance';

function fakeDb(): any {
  return {
    from(table: string) {
      const filters: Array<(r: any) => boolean> = [];
      let cap = Infinity;
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => { filters.push(r => r[key] === value); return q; },
        in: (key: string, values: unknown[]) => { filters.push(r => values.includes(r[key])); return q; },
        is: (key: string, value: unknown) => { filters.push(r => (r[key] ?? null) === value); return q; },
        order: () => q, limit: (n: number) => { cap = n; return q; }, range: () => q,
        maybeSingle: async () => ({ data: (state.tables[table] || []).find(r => filters.every(f => f(r))) || null, error: state.errors[table] || null }),
        then(resolve: any, reject: any) {
          const rows = (state.tables[table] || []).filter(r => filters.every(f => f(r)));
          return Promise.resolve({ data: rows.slice(0, cap), count: rows.length, error: state.errors[table] || null }).then(resolve, reject);
        },
      };
      return q;
    },
    rpc: async (name: string, { p_record: record }: any) => {
      expect(name).toBe('save_school_group_attendance'); state.writes.push('school_group_attendance_attestations');
      const rows = state.tables.school_group_attendance_attestations;
      let row = rows.find(a => a.group_id === record.group_id && a.student_id === record.student_id && a.start_time === record.start_time);
      if (!row) { row = { id: `attendance-${rows.length}`, ...record, reviewed_at: null }; rows.push(row); }
      else if (row.status !== record.status) { Object.assign(row, { status: record.status, contract_confirmed: record.contract_confirmed,
        confirmed_by: record.confirmed_by, confirmed_at: record.confirmed_at, reviewed_at: null }); }
      return { data: { ...row }, error: null };
    },
  };
}
const start = '2026-09-30T06:00:00.000Z', end = '2026-09-30T07:00:00.000Z';
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  state.userId = 'teacher'; state.admin = null; state.writes = []; state.errors = {};
  state.tables = {
    school_class_groups: [{ id: 'group', organization_id: 'school', tutor_id: 'teacher', name: 'IT Juniors',
      school_year_start: '2026-09-01', school_year_end: '2027-06-15', slots: [{ weekday: 3, start_time: '09:00:00', end_time: '10:00:00' }] }],
    profiles: [{ id: 'teacher', organization_id: 'school', full_name: 'Teacher' }],
    organizations: [{ id: 'school', entity_type: 'school', features: { school_extra_lessons_contract: true } }],
    school_class_group_members: ['existing', 'unsigned'].map(student_id => ({ group_id: 'group', student_id, enrolled_at: '2026-09-01T00:00:00Z', schedule_slots: null })),
    students: ['existing', 'unsigned'].map(id => ({ id, organization_id: 'school', full_name: `Student ${id}`, detached_at: null })),
    sessions: [{ id: 'anchor', class_group_id: 'group', tutor_id: 'teacher', student_id: 'existing', start_time: start, end_time: end, status: 'completed' }],
    school_contracts: [{ id: 'unsigned-contract', student_id: 'unsigned', organization_id: 'school', kind: 'extra_lessons', signing_status: 'sent',
      class_group_id: 'group', accepted_at: null, order_snapshot: { group_id: 'group', start_date: '2026-09-01', end_date: '2027-06-15' } }],
    school_group_attendance_attestations: [], session_recurrence_exclusions: [],
  };
});
afterEach(() => vi.useRealTimers());
async function request(method = 'POST', body: any = {}, query: any = {}) {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method, headers: {}, body: { anchorSessionId: 'anchor', studentId: 'unsigned', status: 'completed', ...body }, query } as any, res);
  return { code: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] };
}
describe('school group attendance independent of contract acceptance', () => {
  it('persists attendance and its alert without creating a lesson or accepting/billing a contract', async () => {
    const before = JSON.stringify({ sessions: state.tables.sessions, contracts: state.tables.school_contracts });
    const result = await request();
    expect(result.code).toBe(200); expect(result.body.attendance).toMatchObject({ status: 'completed', contractConfirmed: false });
    expect(state.writes).toEqual(['school_group_attendance_attestations']);
    expect(JSON.stringify({ sessions: state.tables.sessions, contracts: state.tables.school_contracts })).toBe(before);
  });
  it('supports an all-unsigned canonical occurrence with no real anchor and ignores a fabricated end time', async () => {
    state.tables.sessions = [];
    expect((await request('POST', { anchorSessionId: '', groupId: 'group', startTime: start, endTime: '2099-01-01T00:00:00Z' })).code).toBe(200);
    expect(state.tables.school_group_attendance_attestations[0].end_time).toBe(end);
  });
  it('returns authoritative eligibility, contract state and previously saved standalone attendance', async () => {
    await request();
    const { body } = await request('GET', {}, { anchorSessionId: 'anchor' });
    expect(body.participants.find((p: any) => p.studentId === 'unsigned')).toMatchObject({ contractRequired: true,
      contractConfirmed: false, canConfirmAttendance: true, attendance: { status: 'completed', contractConfirmed: false } });
    expect(body.participants.find((p: any) => p.studentId === 'existing')).toMatchObject({ realSessionId: 'anchor', canConfirmAttendance: false });
  });
  it('keeps repeat clicks idempotent and removes the actionable alert after a correction to no-show', async () => {
    const first = await request(); vi.advanceTimersByTime(1000); await request();
    expect(state.tables.school_group_attendance_attestations).toHaveLength(1);
    expect(state.tables.school_group_attendance_attestations[0].confirmed_at).toBe(first.body.attendance.statusConfirmedAt);
    state.userId = 'admin'; state.admin = { organizationId: 'school', role: 'owner', permissions: {} };
    expect((await request('GET', {}, { action: 'alerts' })).body.total).toBe(1);
    await request('POST', { status: 'no_show' });
    expect((await request('GET', {}, { action: 'alerts' })).body.total).toBe(0);
  });
  it('preserves the historical unsigned snapshot after the parent accepts later', async () => {
    await request(); Object.assign(state.tables.school_contracts[0], { signing_status: 'signed', accepted_at: '2026-09-30T12:00:00Z', start_within_14_status: 'yes' });
    const meta = await request('GET', {}, { anchorSessionId: 'anchor' });
    expect(meta.body.participants.find((p: any) => p.studentId === 'unsigned').contractConfirmed).toBe(false);
    await request(); expect(state.tables.school_group_attendance_attestations[0].contract_confirmed).toBe(false);
  });
  it('does not borrow an annual agreement for an extra-contract-required occurrence', () => {
    expect(attendanceContractConfirmed([{ kind: 'annual', signing_status: 'signed' }], { groupId: 'group', startTime: start }, true)).toBe(false);
  });
  it('preserves a signed agreement that was archived or terminated after the occurrence', () => {
    const contract = { kind: 'extra_lessons', class_group_id: 'group', signing_status: 'signed', accepted_at: '2026-09-01T00:00:00Z',
      archived_at: '2026-09-30T12:00:00Z', terminated_at: '2026-09-30T12:00:00Z', start_within_14_status: 'yes',
      order_snapshot: { group_id: 'group', start_date: '2026-09-01', end_date: '2027-06-15' } } as any;
    expect(attendanceContractConfirmed([contract], { groupId: 'group', startTime: start }, true)).toBe(true);
    expect(attendanceContractConfirmed([{ ...contract, terminated_at: '2026-09-29T12:00:00Z' }], { groupId: 'group', startTime: start }, true)).toBe(false);
  });
  it.each([
    ['the 14-day service waiting period', { accepted_at: '2026-09-29T12:00:00Z', start_within_14_status: 'no' }],
    ['a service suspension', { accepted_at: '2026-09-01T00:00:00Z', suspension_started_at: '2026-09-15T00:00:00Z', suspension_until: '2026-10-15' }],
  ])('keeps a signed agreement confirmed during %s without creating an unsigned-contract alert', async (_label, fields) => {
    Object.assign(state.tables.school_contracts[0], { signing_status: 'signed', ...fields });
    const result = await request();
    expect(result.body.attendance.contractConfirmed).toBe(true);
    state.userId = 'admin'; state.admin = { organizationId: 'school', role: 'owner', permissions: {} };
    expect((await request('GET', {}, { action: 'alerts' })).body.total).toBe(0);
    expect(state.writes).toEqual(['school_group_attendance_attestations']);
  });
  it('rejects foreign teachers, foreign administrators and administrators without edit permission', async () => {
    for (const admin of [null, { organizationId: 'other', role: 'owner', permissions: {} },
      { organizationId: 'school', role: 'custom', permissions: { 'sessions.view': true, 'sessions.edit': false } }]) {
      state.userId = 'other'; state.admin = admin; expect((await request()).code).toBe(403);
    }
    expect(state.writes).toHaveLength(0);
  });
  it('rejects nonmembers and existing-session requests', async () => {
    expect((await request('POST', { studentId: 'outside' })).code).toBe(403);
    expect((await request('POST', { studentId: 'existing' })).body.error).toBe('use_existing_session');
    expect(state.writes).toHaveLength(0);
  });
  it('rejects future, unscheduled, outside-year and entire cancelled occurrences', async () => {
    for (const startTime of ['2026-10-07T06:00:00Z', '2026-09-30T08:00:00Z', '2026-08-26T06:00:00Z']) {
      expect((await request('POST', { anchorSessionId: '', groupId: 'group', startTime })).code).toBe(409);
    }
    state.tables.sessions[0].status = 'cancelled';
    expect((await request()).body.error).toBe('occurrence_cancelled'); expect(state.writes).toHaveLength(0);
  });
  it('rejects detached, newly enrolled, wrong-slot and deleted student occurrences', async () => {
    state.tables.students[1].detached_at = '2026-09-01T00:00:00Z'; expect((await request()).body.error).toBe('student_not_active');
    state.tables.students[1].detached_at = null; state.tables.school_class_group_members[1].enrolled_at = '2026-09-30T12:00:00Z';
    expect((await request()).body.error).toBe('not_enrolled_at_occurrence');
    state.tables.school_class_group_members[1].enrolled_at = null; state.tables.school_class_group_members[1].schedule_slots = [{ weekday: 1, start_time: '09:00' }];
    expect((await request()).body.error).toBe('not_in_occurrence_schedule');
    state.tables.school_class_group_members[1].schedule_slots = null; state.tables.session_recurrence_exclusions = [{ class_group_id: 'group', student_id: 'unsigned', scope: 'single', start_time: start }];
    expect((await request()).body.error).toBe('occurrence_deleted'); expect(state.writes).toHaveLength(0);
  });
  it('allows ordinary school groups without optional extra agreements and protects admin alert scope', async () => {
    state.tables.organizations[0].features = {}; state.tables.school_contracts = [];
    expect((await request()).body.attendance.contractConfirmed).toBe(true);
    expect((await request('GET', {}, { action: 'alerts' })).code).toBe(403);
    state.userId = 'admin'; state.admin = { organizationId: 'school', role: 'owner', permissions: {} };
    state.tables.school_group_attendance_attestations.push({ organization_id: 'other', status: 'completed', contract_confirmed: false, reviewed_at: null });
    expect((await request('GET', {}, { action: 'alerts' })).body.total).toBe(0);
  });
  it('also records legacy real-session attendance without changing its normal status/billing path', async () => {
    const session = { id: 'legacy', class_group_id: 'group', tutor_id: 'teacher', student_id: 'unsigned', status: 'completed', start_time: start, end_time: end };
    await recordExistingSchoolAttendance(fakeDb(), session, 'teacher', '2026-09-30T12:00:00Z');
    expect(state.tables.school_group_attendance_attestations[0]).toMatchObject({ anchor_session_id: 'legacy', contract_confirmed: false });
    await recordExistingSchoolAttendance(fakeDb(), { ...session, status: 'no_show' }, 'teacher', '2026-09-30T12:05:00Z');
    expect(state.tables.school_group_attendance_attestations[0].status).toBe('no_show');
    expect(state.writes.every(t => t === 'school_group_attendance_attestations')).toBe(true);
  });
  it('preserves existing confirmation during a missing-table overlap and exposes alert failure', async () => {
    const session = { id: 'legacy', class_group_id: 'group', tutor_id: 'teacher', student_id: 'unsigned', status: 'completed', start_time: start, end_time: end };
    state.errors.school_group_attendance_attestations = { code: '42P01' };
    expect(await recordExistingSchoolAttendance(fakeDb(), session, 'teacher', end)).toEqual({ pending: true });
    state.errors.school_group_attendance_attestations = { code: 'database_offline' };
    await expect(recordExistingSchoolAttendance(fakeDb(), session, 'teacher', end)).rejects.toMatchObject({ code: 'database_offline' });
    state.tables.organizations[0].entity_type = 'company';
    expect(await recordExistingSchoolAttendance(fakeDb(), session, 'teacher', end)).toBeUndefined();
    expect(state.writes).toHaveLength(0);
  });
});
