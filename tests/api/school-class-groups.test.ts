// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchoolClassGroupMemberWrite } from '../../src/lib/schoolClassGroups';

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  requireAdmin: vi.fn(),
  serviceSupabase: vi.fn(),
  materialize: vi.fn(),
  reconcileMinimum: vi.fn(),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.verifyAuth }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: mocks.requireAdmin }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: mocks.serviceSupabase }));
vi.mock('../../api/_lib/schoolClassGroupMaterialize.js', () => ({
  materializeClassGroupNow: mocks.materialize,
  removeFutureClassGroupSessions: vi.fn(),
}));
vi.mock('../../api/_lib/schoolGroupMinimumPolicy.js', () => ({ reconcileSchoolGroupMinimum: mocks.reconcileMinimum }));

import handler from '../../api/school-class-groups';

type Row = Record<string, unknown>;
const ORG_ID = 'school-org';
const GROUP_ID = 'existing-group';
const DEFAULT_ENROLLED_AT = '2026-09-28T09:00:00.000Z';
const SLOTS = [
  { weekday: 2, start_time: '11:00', end_time: '11:45' },
  { weekday: 4, start_time: '13:00', end_time: '13:45' },
];

function existingMembers(count = 6): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    group_id: GROUP_ID,
    student_id: `student-${index + 1}`,
    enrolled_at: `2026-09-0${index + 1}T08:00:00.000Z`,
    schedule_slots: null,
  }));
}

/**
 * Exercise the real Supabase/PostgREST query builder without network access.
 * Bulk inserts use the union of JSON columns: missing enrolled_at values
 * become NULL unless Prefer: missing=default requests the DB's now() default.
 */
function localDatabase(members = existingMembers()) {
  const tables: Record<string, Row[]> = {
    profiles: [
      { id: 'admin-user', organization_id: ORG_ID },
      { id: 'teacher-user', organization_id: ORG_ID },
    ],
    students: Array.from({ length: 8 }, (_, index) => ({
      id: `student-${index + 1}`, organization_id: ORG_ID,
    })),
    school_class_groups: [{ id: GROUP_ID, organization_id: ORG_ID, tutor_id: 'teacher-user' }],
    school_class_group_slots: SLOTS.map((slot) => ({ group_id: GROUP_ID, ...slot })),
    school_class_group_members: structuredClone(members),
    session_recurrence_exclusions: [],
  };
  const memberWrites: Array<{ headers: Headers; rows: Row[] }> = [];
  const deletedMembers: Row[] = [];

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1)!;
    if (!tables[table]) throw new Error(`Unexpected table: ${table}`);
    const method = init?.method || 'GET';
    const headers = new Headers(init?.headers);
    const prefer = headers.get('Prefer') || '';
    const matches = (row: Row) => [...url.searchParams].every(([field, expression]) => {
      if (['select', 'columns', 'on_conflict', 'order', 'offset', 'limit'].includes(field)) return true;
      if (expression.startsWith('eq.')) return row[field] === expression.slice(3);
      if (expression === 'is.null') return row[field] == null;
      if (expression.startsWith('in.(')) {
        const values = expression.slice(4, -1).split(',').map((value) => value.replace(/^"|"$/g, ''));
        return values.includes(String(row[field]));
      }
      throw new Error(`Unexpected filter: ${field}=${expression}`);
    });
    const response = (rows: Row[]) => new Response(JSON.stringify(
      headers.get('Accept')?.includes('vnd.pgrst.object') ? rows[0] : rows,
    ), { status: 200, headers: { 'Content-Type': 'application/json' } });

    if (method === 'GET') {
      const rows = tables[table].filter(matches);
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || rows.length);
      return response(rows.slice(offset, offset + limit));
    }
    if (method === 'DELETE') {
      if (table === 'school_class_group_members') deletedMembers.push(...tables[table].filter(matches));
      tables[table] = tables[table].filter((row) => !matches(row));
      return new Response(null, { status: 204 });
    }
    const payload = JSON.parse(String(init?.body)) as Row | Row[];
    if (method === 'PATCH') {
      for (const row of tables[table].filter(matches)) Object.assign(row, payload);
      return new Response(null, { status: 204 });
    }
    if (method !== 'POST') throw new Error(`Unexpected method: ${method}`);
    const rows = Array.isArray(payload) ? payload : [payload];
    if (table === 'school_class_group_members') {
      memberWrites.push({ headers, rows: structuredClone(rows) });
      const columns = new Set(rows.flatMap((row) => Object.keys(row)));
      const normalized = rows.map((row) => ({
        ...row,
        enrolled_at: Object.hasOwn(row, 'enrolled_at')
          ? row.enrolled_at
          : !columns.has('enrolled_at') || prefer.includes('missing=default')
            ? DEFAULT_ENROLLED_AT
            : null,
      }));
      // PostgreSQL validates NOT NULL before resolving the upsert conflict.
      if (normalized.some((row) => row.enrolled_at == null)) {
        return new Response(JSON.stringify({
          code: '23502',
          message: 'null value in column "enrolled_at" of relation "school_class_group_members" violates not-null constraint',
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      for (const row of normalized) {
        const existing = tables[table].find((member) => (
          member.group_id === row.group_id && member.student_id === row.student_id
        ));
        if (existing) Object.assign(existing, row);
        else tables[table].push(row);
      }
    } else {
      for (const row of rows) {
        if (table === 'school_class_groups') row.id = 'created-group';
        tables[table].push(row);
      }
    }
    return prefer.includes('return=representation') ? response(rows) : new Response(null, { status: 204 });
  };

  const client = createClient('https://school-test.invalid', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  return { client, tables, memberWrites, deletedMembers };
}

function writeBody(studentIds: string[]) {
  return {
    id: GROUP_ID,
    name: 'STEAM group',
    tutor_id: 'teacher-user',
    school_year_start: '2026-09-28',
    school_year_end: '2027-06-15',
    duration_minutes: 45,
    slots: SLOTS,
    members: studentIds.map<SchoolClassGroupMemberWrite>((student_id) => ({ student_id, schedule_slots: null })),
  };
}

async function request(method: 'GET' | 'POST' | 'PATCH', body: Row) {
  const result = { status: 0, body: null as Row | null };
  const res = {
    status(status: number) { result.status = status; return this; },
    json(responseBody: Row) { result.body = responseBody; return this; },
  };
  await handler({ method, body, query: {}, headers: {} } as any, res as any);
  return result;
}

describe('/api/school-class-groups membership writes', () => {
  beforeEach(() => {
    mocks.verifyAuth.mockReset().mockResolvedValue({ userId: 'admin-user', isInternal: false });
    mocks.requireAdmin.mockReset().mockResolvedValue({ ok: true, access: { organizationId: ORG_ID } });
    mocks.serviceSupabase.mockReset();
    mocks.materialize.mockReset().mockResolvedValue({ created: 7, deleted: 0, updated: 0, adopted: 0 });
    mocks.reconcileMinimum.mockReset().mockResolvedValue(undefined);
  });

  it('gives teachers deletion exclusions only for their own visible groups', async () => {
    const db = localDatabase();
    db.tables.school_class_groups.push({ id: 'other-teacher-group', organization_id: ORG_ID, tutor_id: 'other-teacher' });
    db.tables.session_recurrence_exclusions.push(
      { id: 'own-exclusion', class_group_id: GROUP_ID, student_id: null, scope: 'single', start_time: '2026-09-30T06:00:00Z' },
      { id: 'other-exclusion', class_group_id: 'other-teacher-group', student_id: 'private-student', scope: 'all', start_time: null },
    );
    mocks.serviceSupabase.mockReturnValue(db.client);
    mocks.verifyAuth.mockResolvedValue({ userId: 'teacher-user', isInternal: false });
    mocks.requireAdmin.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });

    const result = await request('GET', {});

    expect(result.status).toBe(200);
    expect(result.body?.groups).toEqual([expect.objectContaining({
      id: GROUP_ID,
      recurrence_exclusions: [{ student_id: null, scope: 'single', start_time: '2026-09-30T06:00:00Z' }],
    })]);
    expect(JSON.stringify(result.body)).not.toContain('private-student');
  });

  it('adds a seventh member to six existing members without resetting enrollment dates', async () => {
    const original = existingMembers();
    const db = localDatabase(original);
    mocks.serviceSupabase.mockReturnValue(db.client);
    const body = writeBody(Array.from({ length: 7 }, (_, index) => `student-${index + 1}`));
    body.members[0].schedule_slots = [{ weekday: 4, start_time: '13:00' }];

    const result = await request('PATCH', body);

    expect(result).toMatchObject({ status: 200, body: { ok: true } });
    const saved = db.tables.school_class_group_members;
    expect(saved).toHaveLength(7);
    for (const member of original) {
      expect(saved.find((row) => row.student_id === member.student_id)?.enrolled_at).toBe(member.enrolled_at);
    }
    expect(saved.find((row) => row.student_id === 'student-7')?.enrolled_at).toBe(DEFAULT_ENROLLED_AT);
    expect(saved.find((row) => row.student_id === 'student-1')?.schedule_slots).toEqual([
      { weekday: 4, start_time: '13:00' },
    ]);
    expect(db.memberWrites[0].headers.get('Prefer')).toContain('missing=default');
    expect(db.deletedMembers).toEqual([]);
    expect(mocks.materialize).toHaveBeenCalledWith(db.client, GROUP_ID, ORG_ID);
  });

  it('removes only deselected members while updating schedules and preserving other groups', async () => {
    const original = existingMembers();
    const otherGroupMember = { ...original[0], group_id: 'other-group' };
    const db = localDatabase([...original, otherGroupMember]);
    mocks.serviceSupabase.mockReturnValue(db.client);
    const body = writeBody(['student-1', 'student-2', 'student-3', 'student-4', 'student-5']);
    body.members[1].schedule_slots = [{ weekday: 2, start_time: '11:00' }];

    const result = await request('PATCH', body);

    expect(result.status).toBe(200);
    expect(db.deletedMembers).toEqual([original[5]]);
    expect(db.tables.school_class_group_members).toHaveLength(6);
    expect(db.tables.school_class_group_members).toContainEqual(otherGroupMember);
    const updated = db.tables.school_class_group_members.find((row) => (
      row.group_id === GROUP_ID && row.student_id === 'student-2'
    ));
    expect(updated).toMatchObject({
      enrolled_at: original[1].enrolled_at,
      schedule_slots: [{ weekday: 2, start_time: '11:00' }],
    });
    expect(mocks.materialize).toHaveBeenCalledWith(db.client, GROUP_ID, ORG_ID);
  });

  it('creates a group with seven new members using the enrollment default', async () => {
    const db = localDatabase([]);
    mocks.serviceSupabase.mockReturnValue(db.client);
    const body = writeBody(Array.from({ length: 7 }, (_, index) => `student-${index + 1}`));
    const result = await request('POST', body);

    expect(result).toMatchObject({ status: 200, body: { ok: true, group: { id: 'created-group' } } });
    expect(db.tables.school_class_group_members).toHaveLength(7);
    expect(db.tables.school_class_group_members.every((row) => (
      row.group_id === 'created-group' && row.enrolled_at === DEFAULT_ENROLLED_AT
    ))).toBe(true);
    expect(db.tables.school_class_group_slots.filter((row) => row.group_id === 'created-group')).toHaveLength(2);
    expect(mocks.materialize).toHaveBeenCalledWith(db.client, 'created-group', ORG_ID);
  });

  it('lets the administrator select a minimum of two and immediately checks the group policy', async () => {
    const db = localDatabase();
    mocks.serviceSupabase.mockReturnValue(db.client);
    const result = await request('PATCH', { ...writeBody(['student-1', 'student-2']), minimum_active_students: 2 });
    expect(result.status).toBe(200);
    expect(db.tables.school_class_groups[0].minimum_active_students).toBe(2);
    expect(mocks.reconcileMinimum).toHaveBeenCalledWith(expect.anything(), db.client, expect.objectContaining({ organizationId: ORG_ID, groupId: GROUP_ID }));
  });

  it('rejects invalid minimums and prevents a teacher from changing a valid minimum', async () => {
    const db = localDatabase();
    mocks.serviceSupabase.mockReturnValue(db.client);
    expect((await request('PATCH', { ...writeBody(['student-1']), minimum_active_students: 4 })).status).toBe(400);
    mocks.verifyAuth.mockResolvedValue({ userId: 'teacher-user', isInternal: false });
    mocks.requireAdmin.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    expect((await request('PATCH', { ...writeBody(['student-1']), minimum_active_students: 2 })).status).toBe(403);
    expect(db.tables.school_class_groups[0].minimum_active_students).toBeUndefined();
  });

  it('preserves omitted recording plans and writes explicit child/group choices without changing enrollment', async () => {
    const original = existingMembers();
    original[0].recording_access = 'none'; original[1].recording_access = 'group';
    original[0].legacy_recording_scope = { schedule_slots: null };
    const db = localDatabase(original);
    mocks.serviceSupabase.mockReturnValue(db.client);
    const body = writeBody(['student-1', 'student-2']);
    body.members[1].recording_access = 'none';
    expect((await request('PATCH', body)).status).toBe(200);
    expect(db.tables.school_class_group_members).toEqual([
      expect.objectContaining({ student_id: 'student-1', recording_access: 'none', enrolled_at: original[0].enrolled_at, legacy_recording_scope: { schedule_slots: null } }),
      expect.objectContaining({ student_id: 'student-2', recording_access: 'none', enrolled_at: original[1].enrolled_at }),
    ]);
  });

  it('rejects invalid modes and prevents teacher group creation from granting recording plans', async () => {
    const db = localDatabase(); mocks.serviceSupabase.mockReturnValue(db.client);
    const body = writeBody(['student-1']); body.members[0].recording_access = 'invalid' as any;
    expect((await request('PATCH', body)).status).toBe(400);
    mocks.verifyAuth.mockResolvedValue({ userId: 'teacher-user', isInternal: false });
    mocks.requireAdmin.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    body.members[0].recording_access = 'group';
    expect((await request('POST', body)).status).toBe(403);
    expect(db.memberWrites).toEqual([]);
  });
});
