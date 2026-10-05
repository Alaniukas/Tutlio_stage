import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  applyCalendarSeriesEdit,
  CalendarSeriesConflictError,
  loadFutureCalendarSeries,
} from '@/lib/calendarSessionSeriesEdit';

type Row = {
  id: string; student_id: string; tutor_id: string; recurring_session_id: string;
  subject_id: string; start_time: string; end_time: string; status: string;
};
const lesson = (id: string, day: number, extra: Partial<Row> = {}): Row => ({
  id, student_id: 'student', tutor_id: 'tutor', recurring_session_id: 'series',
  subject_id: 'math', status: 'active',
  start_time: `2026-10-${String(day).padStart(2, '0')}T14:00:00.000Z`,
  end_time: `2026-10-${String(day).padStart(2, '0')}T15:00:00.000Z`,
  ...extra,
});
const series = () => [lesson('a', 6), lesson('b', 13), lesson('c', 20)];

/** Exercise the actual supabase-js filters and writes against an in-memory REST transport. */
function database(initial: Row[], failOffset?: number) {
  const rows = structuredClone(initial);
  const reads: URL[] = [];
  const writes: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = createClient('https://calendar.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json' },
      });
      const matches = (row: Row) => [...url.searchParams].every(([key, filter]) => {
        if (['select', 'order', 'offset', 'limit'].includes(key)) return true;
        const dot = filter.indexOf('.');
        const operator = filter.slice(0, dot);
        const value = filter.slice(dot + 1);
        const actual = row[key as keyof Row];
        switch (operator) {
          case 'eq': return actual === value;
          case 'neq': return actual !== value;
          case 'in': return value.slice(1, -1).split(',').includes(actual);
          case 'gte': return Date.parse(actual) >= Date.parse(value);
          case 'lt': return Date.parse(actual) < Date.parse(value);
          case 'gt': return Date.parse(actual) > Date.parse(value);
          default: throw new Error(`Unexpected filter: ${key}=${filter}`);
        }
      });
      if (init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body));
        const selected = rows.filter(matches);
        if (selected.some(row => patch.start_time && rows.some(other => other.id !== row.id
          && other.student_id === row.student_id && other.tutor_id === row.tutor_id
          && Date.parse(other.start_time) === Date.parse(patch.start_time)))) {
          return reply({ message: 'Duplicate student start', code: '23505' }, 409);
        }
        for (const row of selected) {
          writes.push({ id: row.id, patch });
          Object.assign(row, patch);
        }
        return reply(selected.map(({ id }) => ({ id })));
      }
      reads.push(url);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (offset === failOffset) return reply({ message: 'Bookings failed to load', code: 'XX000' }, 500);
      const selected = rows.filter(matches).sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time)
        || a.id.localeCompare(b.id));
      return reply(selected.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000)));
    } },
  });
  return { client, rows, reads, writes };
}
const next = (day: number) => ({
  start: new Date(lesson('next', day).start_time), end: new Date(lesson('next', day).end_time),
});
const move = (db: ReturnType<typeof database>, rows: Row[], day: number) => applyCalendarSeriesEdit(db.client, {
  tutorId: 'tutor', rows, edited: rows[0], next: next(day), fields: { topic: 'Algebra' },
});

describe('tutor calendar series edits', () => {
  it('moves a series one week later without conflicting with its old occurrences', async () => {
    const rows = series();
    const db = database(rows);
    expect(await move(db, rows, 13)).toEqual(['c', 'b', 'a']);
    expect(db.rows.map(row => row.start_time)).toEqual([lesson('a', 13), lesson('b', 20), lesson('c', 27)]
      .map(row => row.start_time));
    expect(db.reads[0].searchParams.get('start_time')).toBe('lt.2026-10-27T15:00:00.000Z');
    expect(db.reads[0].searchParams.get('end_time')).toBe('gt.2026-10-13T14:00:00.000Z');
    expect(db.reads[0].searchParams.has('or')).toBe(false);
  });

  it('moves a series one week earlier in an order that avoids transient duplicate starts', async () => {
    const rows = [lesson('a', 13), lesson('b', 20), lesson('c', 27)];
    const db = database(rows);
    expect(await move(db, rows, 6)).toEqual(['a', 'b', 'c']);
    expect(db.rows.map(row => row.start_time)).toEqual(series().map(row => row.start_time));
  });

  it('leaves every occurrence unchanged when a later proposed date hits another lesson', async () => {
    const rows = series();
    const db = database([...rows, lesson('other', 14, { recurring_session_id: 'other-series', student_id: 'other' })]);
    await expect(move(db, rows, 7)).rejects.toMatchObject({
      start: next(14).start, end: next(14).end,
    });
    expect(db.writes).toEqual([]);
    expect(db.rows.slice(0, 3)).toEqual(rows);
  });

  it('allows shared group rows but still detects an unrelated lesson at the same destination', async () => {
    const rows = [lesson('a', 6), lesson('peer', 6, { student_id: 'peer', recurring_session_id: 'peer-series' })];
    const db = database(rows);
    await expect(move(db, rows, 7)).resolves.toHaveLength(2);
    expect(db.rows.every(row => row.start_time === lesson('next', 7).start_time)).toBe(true);

    const blocked = database([...rows, lesson('other', 7, { student_id: 'other', recurring_session_id: 'other' })]);
    await expect(move(blocked, rows, 7)).rejects.toBeInstanceOf(CalendarSeriesConflictError);
    expect(blocked.writes).toEqual([]);
  });

  it('detects overlaps between proposed occurrences when the duration grows', async () => {
    const rows = series();
    const db = database(rows);
    await expect(applyCalendarSeriesEdit(db.client, {
      tutorId: 'tutor', rows, edited: rows[0],
      next: { start: next(6).start, end: next(14).end }, fields: {},
    })).rejects.toBeInstanceOf(CalendarSeriesConflictError);
    expect(db.writes).toEqual([]);
  });

  it('ignores cancelled destinations and lessons belonging to another tutor', async () => {
    const rows = series();
    const db = database([...rows,
      lesson('cancelled', 7, { status: 'cancelled', student_id: 'other' }),
      lesson('other-tutor', 14, { tutor_id: 'other' }),
    ]);
    await expect(move(db, rows, 7)).resolves.toHaveLength(3);
  });

  it('saves price-only edits without checking or rewriting lesson times', async () => {
    const rows = series();
    const db = database(rows);
    await applyCalendarSeriesEdit(db.client, {
      tutorId: 'tutor', rows, edited: rows[0], next: next(6), fields: { price: 30 },
    });
    expect(db.reads).toEqual([]);
    expect(db.writes.every(write => !('start_time' in write.patch))).toBe(true);
    expect(db.rows.map(row => row.start_time)).toEqual(rows.map(row => row.start_time));
  });

  it('checks bookings beyond the first 1000 rows before making any changes', async () => {
    const rows = series();
    const db = database([...rows, ...Array.from({ length: 1001 }, (_, i) => lesson(`busy-${i}`, 9)),
      lesson('late-conflict', 21, { student_id: 'other', recurring_session_id: 'other' }),
    ]);
    await expect(move(db, rows, 7)).rejects.toBeInstanceOf(CalendarSeriesConflictError);
    expect(db.reads.map(url => url.searchParams.get('offset'))).toEqual(['0', '500', '1000']);
    expect(db.writes).toEqual([]);
  });

  it('stops before all writes when a later booking page fails', async () => {
    const rows = series();
    const db = database([...rows, ...Array.from({ length: 500 }, (_, i) => lesson(`busy-${i}`, 9))], 500);
    await expect(move(db, rows, 7)).rejects.toThrow('Bookings failed to load');
    expect(db.writes).toEqual([]);
  });

  it('loads every active future group participant while excluding history and other series', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => lesson(`group-${i}`, 13, {
      recurring_session_id: i % 2 ? 'peer-series' : 'series', student_id: `student-${i}`,
    }));
    const db = database([...rows,
      lesson('history', 6), lesson('completed', 13, { status: 'completed' }),
      lesson('cancelled', 13, { status: 'cancelled' }),
      lesson('other-series', 13, { recurring_session_id: 'other' }),
      lesson('other-tutor', 13, { tutor_id: 'other' }),
    ]);
    const future = await loadFutureCalendarSeries(db.client, {
      tutorId: 'tutor', from: next(13).start, recurringIds: ['series', 'peer-series'], subjectId: 'math',
    });
    expect(future).toHaveLength(1001);
    expect(future.every(row => row.id.startsWith('group-'))).toBe(true);
    expect(db.reads.map(url => url.searchParams.get('offset'))).toEqual(['0', '500', '1000']);
  });
});
