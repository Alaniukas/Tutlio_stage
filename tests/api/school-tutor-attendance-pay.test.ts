import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userId: '', admin: null as any, tables: {} as Record<string, any[]>,
  errors: {} as Record<string, any>, calls: [] as Array<{ table: string; select?: string }> }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId } : null }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.admin }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => database() }));
import handler from '../../api/school-tutor-attendance-pay';
import { loadSchoolTutorAttendancePayRows, schoolTutorAttendancePayPeriod } from '../../api/_lib/schoolTutorAttendancePay';
import { schoolTutorPayOccurrences } from '../../src/lib/schoolTutorLessonPay';

const teacherId = '10000000-0000-4000-8000-000000000001';
const otherTeacher = '10000000-0000-4000-8000-000000000002';
const organizationId = '20000000-0000-4000-8000-000000000001';
const otherOrg = '20000000-0000-4000-8000-000000000002';
const groupId = '30000000-0000-4000-8000-000000000001';
const start = '2026-09-30T06:00:00.000Z', end = '2026-09-30T07:00:00.000Z';
const input = { tutorId: teacherId, organizationId, periodStart: '2026-09-01', periodEnd: '2026-09-30',
  now: new Date('2026-09-30T12:00:00Z') };
const attendance = (id = 'attendance-a', student = 'child-a', extra: any = {}) => ({
  id, organization_id: organizationId, group_id: groupId, student_id: student, tutor_id: teacherId,
  start_time: start, end_time: end, status: 'completed', confirmed_at: '2026-09-30T11:00:00Z',
  group_name: 'IT Juniors', anchor_session_id: null, tutor_pay_eur_snapshot: 45, contract_confirmed: false, ...extra,
});

function database(): any {
  return { from(table: string) {
    const call: { table: string; select?: string } = { table }; state.calls.push(call);
    const filters: Array<(row: any) => boolean> = []; let first = 0, last = Infinity;
    const rows = () => (state.tables[table] || []).filter(row => filters.every(filter => filter(row)));
    const q: any = {
      select: (fields: string) => { call.select = fields; return q; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; },
      gte: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) >= Date.parse(value)); return q; },
      lt: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) < Date.parse(value)); return q; },
      lte: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) <= Date.parse(value)); return q; },
      order: () => q, range: (from: number, to: number) => { first = from; last = to; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: state.errors[table] ?? null }),
      // Simulate a server page cap below the requested 500 to verify full paging.
      then: (resolve: any, reject: any) => Promise.resolve({ data: rows().slice(first, Math.min(last + 1, first + 1)),
        error: state.errors[table] ?? null }).then(resolve, reject),
    };
    return q;
  } };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(input.now);
  state.userId = teacherId; state.admin = null; state.errors = {}; state.calls = [];
  state.tables = {
    profiles: [{ id: teacherId, organization_id: organizationId }, { id: otherTeacher, organization_id: otherOrg }],
    organizations: [{ id: organizationId, entity_type: 'school' }, { id: otherOrg, entity_type: 'school' }],
    school_group_attendance_attestations: [attendance()], sessions: [],
  };
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function request(query: any = {}, method = 'GET') {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  await handler({ method, headers: {}, query: { tutorId: teacherId, periodStart: input.periodStart,
    periodEnd: input.periodEnd, ...query } } as any, res);
  return { code: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0], headers: res.setHeader.mock.calls };
}

describe('standalone school teacher attendance pay', () => {
  it('returns own school attendance without exposing personal fields or touching sessions/contracts', async () => {
    const result = await request();
    expect(result.code).toBe(200);
    expect(result.headers).toContainEqual(['Cache-Control', 'private, no-store']);
    expect(result.body).toMatchObject({ ok: true, rows: [{ id: 'attendance-a', source_kind: 'attendance',
      class_group_id: groupId, status: 'completed', status_confirmed_at: '2026-09-30T11:00:00Z',
      tutor_pay_eur_snapshot: 45, class_group: { name: 'IT Juniors', calendar_name: null } }] });
    expect(JSON.stringify(result.body)).not.toMatch(/student_name|student_email|contract_confirmed|student_price/);
    expect(state.calls.map(call => call.table)).not.toContain('school_contracts');
  });
  it('allows finance viewers only within their school and denies unauthenticated/foreign/company requests', async () => {
    state.userId = 'admin';
    state.admin = { organizationId, role: 'custom', permissions: { 'finance.view': true } };
    expect((await request()).code).toBe(200);
    expect((await request({ tutorId: otherTeacher })).code).toBe(403);
    state.admin.permissions['finance.view'] = false;
    expect((await request()).code).toBe(403);
    state.admin.permissions['tutors.view'] = true;
    expect((await request()).code).toBe(200);
    state.userId = teacherId; state.admin = null;
    state.tables.organizations[0].entity_type = 'company';
    expect((await request()).code).toBe(403);
    state.userId = '';
    expect((await request()).code).toBe(401);
    expect((await request({}, 'POST')).code).toBe(405);
  });
  it.each([
    { periodStart: '2026-02-30' }, { periodStart: '2026-10-01' }, { periodStart: '2025-08-01' },
    { periodEnd: ['2026-09-30'] }, { tutorId: 'not-a-uuid' }, { periodStart: '2026-09-01T00:00:00Z' },
  ])('rejects malformed/reversed/overlong periods before loading finance: %j', async query => {
    expect((await request(query)).code).toBe(400);
    expect(state.calls).toHaveLength(0);
  });
  it('uses Vilnius date boundaries and paginates all rows while retaining historical rates', async () => {
    state.tables.school_group_attendance_attestations = [attendance(), attendance('attendance-b', 'child-b'),
      attendance('vilnius-month-start', 'child-c', { start_time: '2026-08-31T22:00:00Z', end_time: '2026-08-31T23:00:00Z' }),
      attendance('wrong-school', 'child-d', { organization_id: otherOrg }),
      attendance('wrong-teacher', 'child-e', { tutor_id: otherTeacher })];
    const rows = await loadSchoolTutorAttendancePayRows(database(), input);
    expect(rows.map(row => row.id)).toEqual(['attendance-a', 'attendance-b', 'vilnius-month-start']);
    expect(rows.every(row => row.tutor_pay_eur_snapshot === 45)).toBe(true);
    const period = schoolTutorAttendancePayPeriod(input.periodStart, input.periodEnd);
    expect(new Date(period.from.getTime()).toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(new Date(period.until.getTime()).toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(state.calls.filter(call => call.table === 'school_group_attendance_attestations')).toHaveLength(4);
  });
  it('accepts a full prior calendar year including a leap day', () => {
    const period = schoolTutorAttendancePayPeriod('2024-01-01', '2024-12-31');
    expect(new Date(period.from.getTime()).toISOString()).toBe('2023-12-31T22:00:00.000Z');
    expect(new Date(period.until.getTime()).toISOString()).toBe('2024-12-31T22:00:00.000Z');
    expect(() => schoolTutorAttendancePayPeriod('2023-03-01', '2024-03-01')).not.toThrow();
  });
  it('excludes absence, unconfirmed evidence, invalid durations and future attendance', async () => {
    state.tables.school_group_attendance_attestations = [attendance('no-show', 'a', { status: 'no_show', tutor_pay_eur_snapshot: null }),
      attendance('unconfirmed', 'b', { confirmed_at: null }), attendance('invalid', 'c', { end_time: start }),
      attendance('future', 'd', { end_time: '2026-09-30T15:00:00Z' })];
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toEqual([]);
  });
  it.each(['completed', 'no_show', 'cancelled', 'canceled'])('keeps pay provenance when an authoritative %s real child outcome supersedes attendance', async status => {
    state.tables.sessions = [{ id: 'real-a', tutor_id: teacherId, class_group_id: groupId, student_id: 'child-a', start_time: start,
      status, status_confirmed_at: status.includes('cancel') ? null : '2026-09-30T11:00:00Z' }];
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toMatchObject([
      { id: 'attendance-a', pay_evidence_only: true, tutor_pay_eur_snapshot: 45 },
    ]);
  });
  it.each(['active', 'completed', 'no_show'])('keeps earned attendance after an unconfirmed %s real row materializes', async status => {
    state.tables.sessions = [{ id: 'real-a', tutor_id: teacherId, class_group_id: groupId, student_id: 'child-a', start_time: start,
      status, status_confirmed_at: null, no_show_reason: status === 'no_show' ? 'missed_join' : null }];
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toMatchObject([
      { id: 'attendance-a', pay_evidence_only: false, tutor_pay_eur_snapshot: 45 },
    ]);
  });
  it('keeps a sibling locator but suppresses the same child confirmed anchor even if its real occurrence moved', async () => {
    state.tables.school_group_attendance_attestations[0].anchor_session_id = 'anchor';
    state.tables.sessions = [{ id: 'anchor', tutor_id: teacherId, student_id: 'different-child', class_group_id: groupId,
      start_time: start, status: 'completed', status_confirmed_at: '2026-09-30T11:00:00Z' }];
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toHaveLength(1);
    Object.assign(state.tables.sessions[0], { student_id: 'child-a', start_time: '2026-08-30T06:00:00Z' });
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toMatchObject([{ pay_evidence_only: true }]);
    state.tables.sessions[0].status_confirmed_at = null;
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toMatchObject([{ pay_evidence_only: true }]);
  });
  it('retains known no-show rates only as evidence without establishing a conducted meeting', async () => {
    state.tables.school_group_attendance_attestations = [attendance('absence', 'a', { status: 'no_show' })];
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toMatchObject([
      { id: 'absence', status: 'no_show', pay_evidence_only: true, tutor_pay_eur_snapshot: 45 },
    ]);
  });
  it('preserves the original teacher’s earned attendance if a later replacement belongs to another teacher', async () => {
    state.tables.school_group_attendance_attestations[0].anchor_session_id = 'replacement';
    state.tables.sessions = [{ id: 'replacement', tutor_id: otherTeacher, class_group_id: groupId,
      student_id: 'child-a', start_time: start, status: 'completed', status_confirmed_at: '2026-09-30T11:00:00Z' }];
    expect(await loadSchoolTutorAttendancePayRows(database(), input)).toMatchObject([
      { id: 'attendance-a', tutor_id: teacherId, pay_evidence_only: false, tutor_pay_eur_snapshot: 45 },
    ]);
  });
  it('keeps zero snapshots explicit, unknown rates unresolved, and conflicting historical rates visible', async () => {
    state.tables.school_group_attendance_attestations[0].tutor_pay_eur_snapshot = 0;
    let rows = await loadSchoolTutorAttendancePayRows(database(), input);
    expect(schoolTutorPayOccurrences(rows, 60, input.now)[0].payEur).toBe(0);
    state.tables.school_group_attendance_attestations[0].tutor_pay_eur_snapshot = null;
    rows = await loadSchoolTutorAttendancePayRows(database(), input);
    expect(schoolTutorPayOccurrences(rows, 0, input.now)[0].payIssue).toBe('missing_rate');
    state.tables.school_group_attendance_attestations = [attendance(), attendance('attendance-b', 'child-b', { tutor_pay_eur_snapshot: 60 })];
    rows = await loadSchoolTutorAttendancePayRows(database(), input);
    expect(schoolTutorPayOccurrences(rows, 99, input.now)[0].payIssue).toBe('conflicting_snapshot');
  });
  it('fails closed when the required snapshot schema or database is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.errors.school_group_attendance_attestations = { code: '42703', message: 'Snapshot column missing' };
    expect(await request()).toMatchObject({ code: 503, body: { error: 'School teacher attendance pay is unavailable' } });
    expect(state.calls.filter(call => call.table === 'sessions')).toHaveLength(0);
  });
});
