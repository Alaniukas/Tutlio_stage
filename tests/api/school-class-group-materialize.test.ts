import { describe, expect, it } from 'vitest';
import {
  expectedClassGroupOccurrences,
  isReplaceableGeneratedRow,
  materializationWindow,
  reconcileClassGroupSessions,
  removeFutureClassGroupSessions,
  type MaterializeGroupRow,
} from '../../api/_lib/schoolClassGroupMaterialize';

const NOW = new Date('2026-09-04T12:00:00Z'); // Friday

function group(overrides: Partial<MaterializeGroupRow> = {}): MaterializeGroupRow {
  return {
    id: 'g1',
    organization_id: 'org1',
    tutor_id: 't1',
    subject_id: null,
    meeting_link: 'https://meet.google.com/abc',
    duration_minutes: 45,
    school_year_start: '2026-09-01',
    school_year_end: '2027-06-15',
    slots: [{ weekday: 5, start_time: '19:00', end_time: '19:45' }],
    members: [{ student_id: 's1' }, { student_id: 's2' }],
    ...overrides,
  };
}

type Row = Record<string, any>;

/** Minimal in-memory `sessions` + `students` tables behind a supabase-like query builder. */
function fakeSupabase(sessions: Row[], students: Row[] = [{ id: 's1', detached_at: null }, { id: 's2', detached_at: null }]) {
  const inserted: Row[] = [];
  const deleted: string[] = [];
  const updated: Array<{ id: string; patch: Row }> = [];
  const tables: Record<string, Row[]> = { sessions, students };

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'delete' | 'update' = 'select';
    let patch: Row = {};
    const api: any = {
      select() { return api; },
      eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return api; },
      neq(col: string, v: unknown) { filters.push((r) => r[col] !== v); return api; },
      in(col: string, values: unknown[]) { filters.push((r) => values.includes(r[col])); return api; },
      gt(col: string, v: string) { filters.push((r) => Date.parse(r[col]) > Date.parse(v)); return api; },
      gte(col: string, v: string) { filters.push((r) => Date.parse(r[col]) >= Date.parse(v)); return api; },
      lte(col: string, v: string) { filters.push((r) => Date.parse(r[col]) <= Date.parse(v)); return api; },
      not() { return api; },
      delete() { mode = 'delete'; return api; },
      update(p: Row) { mode = 'update'; patch = p; return api; },
      insert(rows: Row[]) {
        for (const row of rows) {
          const withId = { id: `new-${inserted.length + 1}`, ...row };
          inserted.push(withId);
          tables.sessions.push(withId);
        }
        return Promise.resolve({ error: null });
      },
      maybeSingle() { return api.then((r: any) => ({ data: r.data[0] ?? null, error: null })); },
      then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
        const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
        if (mode === 'delete') {
          for (const r of rows) {
            deleted.push(r.id);
            tables[table] = tables[table].filter((x) => x.id !== r.id);
          }
          return Promise.resolve({ error: null }).then(resolve, reject);
        }
        if (mode === 'update') {
          for (const r of rows) { Object.assign(r, patch); updated.push({ id: r.id, patch }); }
          return Promise.resolve({ error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve, reject);
      },
    };
    return api;
  }
  return { client: { from: builder } as any, inserted, deleted, updated, tables };
}

describe('expectedClassGroupOccurrences', () => {
  it('lists every weekly slot inside the window in Vilnius time and skips lessons that already ended', () => {
    const window = materializationWindow(NOW, 14);
    const occ = expectedClassGroupOccurrences(group(), window);
    expect(occ.map((o) => o.startIso)).toEqual([
      '2026-09-04T16:00:00.000Z', // today 19:00 Vilnius (UTC+3) is still ahead of 12:00Z
      '2026-09-11T16:00:00.000Z',
      '2026-09-18T16:00:00.000Z',
    ]);
    expect(occ[0].endIso).toBe('2026-09-04T16:45:00.000Z');
  });

  it('respects the school year end', () => {
    const window = materializationWindow(NOW, 60);
    const occ = expectedClassGroupOccurrences(group({ school_year_end: '2026-09-12' }), window);
    expect(occ.map((o) => o.ymd)).toEqual(['2026-09-04', '2026-09-11']);
  });
});

describe('reconcileClassGroupSessions', () => {
  it('creates one lesson per member and occurrence, then is idempotent', async () => {
    const db = fakeSupabase([]);
    const window = materializationWindow(NOW, 14);
    const first = await reconcileClassGroupSessions(db.client, group(), { window });
    expect(first).toMatchObject({ created: 6, deleted: 0, updated: 0, adopted: 0 });
    expect(db.inserted[0]).toMatchObject({
      tutor_id: 't1', student_id: 's1', status: 'active', class_group_id: 'g1', school_billing_kind: 'base', price: 0,
      meeting_link: 'https://meet.google.com/abc',
    });
    const second = await reconcileClassGroupSessions(db.client, group(), { window });
    expect(second).toMatchObject({ created: 0, deleted: 0 });
    expect(db.tables.sessions).toHaveLength(6);
  });

  it('moves the future lessons when a slot changes time instead of stacking a duplicate', async () => {
    const db = fakeSupabase([]);
    const window = materializationWindow(NOW, 14);
    await reconcileClassGroupSessions(db.client, group({ slots: [{ weekday: 5, start_time: '18:00', end_time: '18:45' }] }), { window });
    expect(db.tables.sessions).toHaveLength(6);

    const moved = await reconcileClassGroupSessions(db.client, group(), { window }); // 19:00 now
    expect(moved).toMatchObject({ created: 6, deleted: 6 });
    const starts = [...new Set(db.tables.sessions.map((s) => s.start_time))].sort();
    expect(starts).toEqual(['2026-09-04T16:00:00.000Z', '2026-09-11T16:00:00.000Z', '2026-09-18T16:00:00.000Z']);
    expect(db.tables.sessions.every((s) => s.start_time.endsWith('16:00:00.000Z'))).toBe(true);
  });

  it('removes lessons of a student taken out of the group and adds them for a new member', async () => {
    const db = fakeSupabase([], [{ id: 's1', detached_at: null }, { id: 's2', detached_at: null }, { id: 's3', detached_at: null }]);
    const window = materializationWindow(NOW, 14);
    await reconcileClassGroupSessions(db.client, group(), { window });
    const result = await reconcileClassGroupSessions(db.client, group({ members: [{ student_id: 's1' }, { student_id: 's3' }] }), { window });
    expect(result).toMatchObject({ created: 3, deleted: 3 });
    expect(new Set(db.tables.sessions.map((s) => s.student_id))).toEqual(new Set(['s1', 's3']));
  });

  it('keeps history: started, joined, cancelled or completed rows are never deleted', async () => {
    const past = {
      id: 'old', tutor_id: 't1', student_id: 's1', class_group_id: 'g1', status: 'completed',
      start_time: '2026-08-28T16:00:00.000Z', end_time: '2026-08-28T16:45:00.000Z', student_joined_at: null, tutor_joined_at: null,
      subject_id: null, meeting_link: 'https://meet.google.com/abc',
    };
    const joinedFuture = {
      id: 'joined', tutor_id: 't1', student_id: 's1', class_group_id: 'g1', status: 'active',
      start_time: '2026-09-11T15:00:00.000Z', end_time: '2026-09-11T15:45:00.000Z', student_joined_at: '2026-09-11T14:59:00.000Z', tutor_joined_at: null,
      subject_id: null, meeting_link: 'https://meet.google.com/abc',
    };
    const cancelledFuture = { ...joinedFuture, id: 'cancelled', status: 'cancelled', student_joined_at: null, student_id: 's2' };
    const db = fakeSupabase([past, joinedFuture, cancelledFuture]);
    const window = materializationWindow(NOW, 14);
    await reconcileClassGroupSessions(db.client, group(), { window });
    expect(db.deleted).toEqual([]);
    expect(db.tables.sessions.map((s) => s.id)).toEqual(expect.arrayContaining(['old', 'joined', 'cancelled']));
  });

  it('updates teacher and meeting link on kept future rows when the group changes', async () => {
    const db = fakeSupabase([]);
    const window = materializationWindow(NOW, 14);
    await reconcileClassGroupSessions(db.client, group(), { window });
    const result = await reconcileClassGroupSessions(
      db.client,
      group({ tutor_id: 't2', meeting_link: 'https://meet.google.com/new' }),
      { window },
    );
    expect(result.updated).toBe(6);
    expect(db.tables.sessions.every((s) => s.tutor_id === 't2' && s.meeting_link === 'https://meet.google.com/new')).toBe(true);
  });

  it('adopts an orphan lesson that already sits at the same time instead of duplicating it', async () => {
    const orphan = {
      id: 'orphan', tutor_id: 't1', student_id: 's1', class_group_id: null, status: 'active',
      start_time: '2026-09-11T16:00:00.000Z', end_time: '2026-09-11T16:45:00.000Z', student_joined_at: null, tutor_joined_at: null,
      subject_id: null, meeting_link: 'https://meet.google.com/abc',
    };
    const db = fakeSupabase([orphan]);
    const window = materializationWindow(NOW, 14);
    const result = await reconcileClassGroupSessions(db.client, group({ members: [{ student_id: 's1' }] }), { window });
    expect(result).toMatchObject({ created: 2, adopted: 1 });
    expect(db.tables.sessions.find((s) => s.id === 'orphan')?.class_group_id).toBe('g1');
    expect(db.tables.sessions.filter((s) => s.start_time === '2026-09-11T16:00:00.000Z')).toHaveLength(1);
  });

  it('skips archived students and honours the extra-lessons start gate', async () => {
    const db = fakeSupabase([], [{ id: 's1', detached_at: null }, { id: 's2', detached_at: '2026-08-01T00:00:00Z' }]);
    const window = materializationWindow(NOW, 14);
    const gates = new Map([['s1:g1', '2026-09-10']]);
    const result = await reconcileClassGroupSessions(db.client, group(), { window, extraGates: gates });
    expect(result.created).toBe(2); // s1 from 2026-09-11 on, s2 archived
    expect(db.inserted.map((r) => r.start_time)).toEqual(['2026-09-11T16:00:00.000Z', '2026-09-18T16:00:00.000Z']);
  });
});

describe('removeFutureClassGroupSessions', () => {
  it('deletes only generated future rows of the group before the group row goes away', async () => {
    const rows = [
      { id: 'f1', class_group_id: 'g1', status: 'active', start_time: '2026-09-11T16:00:00.000Z', end_time: '2026-09-11T16:45:00.000Z', student_joined_at: null, tutor_joined_at: null },
      { id: 'f2', class_group_id: 'g1', status: 'active', start_time: '2026-09-18T16:00:00.000Z', end_time: '2026-09-18T16:45:00.000Z', student_joined_at: '2026-09-18T15:50:00.000Z', tutor_joined_at: null },
      { id: 'p1', class_group_id: 'g1', status: 'completed', start_time: '2026-08-28T16:00:00.000Z', end_time: '2026-08-28T16:45:00.000Z', student_joined_at: null, tutor_joined_at: null },
      { id: 'o1', class_group_id: 'other', status: 'active', start_time: '2026-09-11T16:00:00.000Z', end_time: '2026-09-11T16:45:00.000Z', student_joined_at: null, tutor_joined_at: null },
    ];
    const db = fakeSupabase(rows);
    const removed = await removeFutureClassGroupSessions(db.client, 'g1', NOW);
    expect(removed).toBe(1);
    expect(db.deleted).toEqual(['f1']);
  });

  it('classifies replaceable rows', () => {
    const base = { id: 'x', student_id: 's', tutor_id: 't', subject_id: null, meeting_link: null, class_group_id: 'g', status: 'active', start_time: '2026-09-11T16:00:00.000Z', end_time: '2026-09-11T16:45:00.000Z', student_joined_at: null, tutor_joined_at: null };
    expect(isReplaceableGeneratedRow(base, NOW.getTime())).toBe(true);
    expect(isReplaceableGeneratedRow({ ...base, status: 'completed' }, NOW.getTime())).toBe(false);
    expect(isReplaceableGeneratedRow({ ...base, tutor_joined_at: '2026-09-11T15:59:00.000Z' }, NOW.getTime())).toBe(false);
    expect(isReplaceableGeneratedRow({ ...base, start_time: '2026-09-01T16:00:00.000Z' }, NOW.getTime())).toBe(false);
  });
});
