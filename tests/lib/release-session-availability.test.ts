import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  releaseSessionSlotAsAvailability,
  sessionInstantToAvailabilityFields,
} from '@/lib/releaseSessionAvailability';

type Row = Record<string, any>;

function mockSupabase(availability: Row[] = [], sessions: Row[] = []) {
  const state = { availability: [...availability], sessions: [...sessions] };
  const readPages = { availability: 0, sessions: 0 };
  const from = vi.fn((table: 'availability' | 'sessions') => {
    if (!(table in state)) throw new Error(`unexpected table ${table}`);
    const filters: Array<(row: Row) => boolean> = [];
    let sortColumn: string | null = null;
    let offset = 0;
    let lastIndex = 999;
    const selectApi = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return selectApi;
      }),
      or: vi.fn((expression: string) => {
        const alternatives = expression.split(',').map((clause) => {
          const [column, , value] = clause.split('.');
          return (row: Row) => row[column] === (value === 'true' ? true : value);
        });
        filters.push((row) => alternatives.some((alternative) => alternative(row)));
        return selectApi;
      }),
      lt: vi.fn((column: string, value: string) => {
        filters.push((row) => new Date(row[column]).getTime() < new Date(value).getTime());
        return selectApi;
      }),
      gt: vi.fn((column: string, value: string) => {
        filters.push((row) => new Date(row[column]).getTime() > new Date(value).getTime());
        return selectApi;
      }),
      order: vi.fn((column: string) => {
        sortColumn = column;
        return selectApi;
      }),
      range: vi.fn((first: number, last: number) => {
        offset = first;
        lastIndex = last;
        return selectApi;
      }),
      then(resolve: (result: { data: Row[]; error: null }) => void) {
        readPages[table] += 1;
        const filtered = state[table].filter((row) => filters.every((filter) => filter(row)));
        if (sortColumn) filtered.sort((a, b) => String(a[sortColumn!]).localeCompare(String(b[sortColumn!])));
        resolve({ data: filtered.slice(offset, lastIndex + 1), error: null });
      },
    };
    return {
      select: vi.fn(() => selectApi),
      insert: vi.fn((payload: Row | Row[]) => {
        const inserted = (Array.isArray(payload) ? payload : [payload])
          .map((row, index) => ({ id: `new-${state[table].length + index}`, ...row }));
        state[table].push(...inserted);
        return {
          then(resolve: (result: { error: null }) => void) { resolve({ error: null }); },
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: inserted[0] ?? null, error: null })),
          })),
        };
      }),
      update: vi.fn((patch: Row) => ({
        eq: vi.fn(async (column: string, value: unknown) => {
          state[table] = state[table].map((row) => row[column] === value ? { ...row, ...patch } : row);
          return { error: null };
        }),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (column: string, value: unknown) => {
          state[table] = state[table].filter((row) => row[column] !== value);
          return { error: null };
        }),
      })),
    };
  });
  return { supabase: { from }, state, readPages };
}

const session = {
  tutorId: 't1',
  startTime: '2026-05-21T12:00:00.000Z',
  endTime: '2026-05-21T13:00:00.000Z',
  subjectId: 'subject1',
  meetingLink: 'https://meet.example/lesson',
};

function specific(start: string, end: string, extra: Row = {}): Row {
  return {
    id: `specific-${start}`,
    tutor_id: 't1',
    is_recurring: false,
    specific_date: '2026-05-21',
    start_time: start,
    end_time: end,
    ...extra,
  };
}

function recurring(start: string, end: string, extra: Row = {}): Row {
  return {
    id: `recurring-${start}`,
    tutor_id: 't1',
    is_recurring: true,
    day_of_week: 4,
    start_date: '2026-05-01',
    end_date: '2026-06-01',
    start_time: start,
    end_time: end,
    ...extra,
  };
}

function timeRanges(rows: Row[]) {
  return rows.map((row) => `${row.start_time}-${row.end_time}`).sort();
}

describe('sessionInstantToAvailabilityFields', () => {
  it('maps UTC instant to Vilnius wall-clock date and times', () => {
    // 2026-05-21 12:00 UTC = 15:00 Vilnius (EEST)
    const { specificDate, startTime, endTime } = sessionInstantToAvailabilityFields(
      '2026-05-21T12:00:00.000Z',
      '2026-05-21T12:45:00.000Z',
    );
    expect(specificDate).toBe('2026-05-21');
    expect(startTime).toBe('15:00');
    expect(endTime).toBe('15:45');
  });
});

describe('releaseSessionSlotAsAvailability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('restores a legacy fully consumed one-time slot and keeps the lesson meeting link', async () => {
    const { supabase, state } = mockSupabase();

    expect(await releaseSessionSlotAsAvailability(supabase as never, session)).toEqual({ created: true });
    expect(state.availability).toEqual([expect.objectContaining({
      tutor_id: 't1',
      specific_date: '2026-05-21',
      start_time: '15:00',
      end_time: '16:00',
      is_recurring: false,
      subject_ids: ['subject1'],
      meeting_link: session.meetingLink,
      public_bookable: false,
    })]);

    expect(await releaseSessionSlotAsAvailability(supabase as never, session)).toEqual({
      created: false, skippedReason: 'overlap',
    });
    expect(state.availability).toHaveLength(1);
  });

  it('refills a legacy split one-time window with its original metadata', async () => {
    const metadata = {
      subject_ids: ['subject1', 'subject2'],
      meeting_link: 'https://meet.example/original',
      public_bookable: true,
    };
    const { supabase, state } = mockSupabase([
      specific('14:00', '15:00', metadata), specific('16:00', '17:00', metadata),
    ]);

    await releaseSessionSlotAsAvailability(supabase as never, session);
    expect(timeRanges(state.availability)).toEqual(['14:00-15:00', '15:00-16:00', '16:00-17:00']);
    expect(state.availability.find((row) => row.start_time === '15:00')).toMatchObject(metadata);
  });

  it('fills partial gaps while leaving an overlapping active lesson occupied', async () => {
    const { supabase, state } = mockSupabase([specific('15:00', '15:15')], [{
      id: 'other', tutor_id: 't1', status: 'active',
      start_time: '2026-05-21T12:30:00.000Z', end_time: '2026-05-21T12:45:00.000Z',
    }]);

    await releaseSessionSlotAsAvailability(supabase as never, session);
    expect(timeRanges(state.availability)).toEqual(['15:00-15:15', '15:15-15:30', '15:45-16:00']);
  });

  it('does not duplicate untouched recurring availability', async () => {
    const { supabase, state } = mockSupabase([recurring('14:00', '17:00')]);
    expect(await releaseSessionSlotAsAvailability(supabase as never, session)).toEqual({
      created: false, skippedReason: 'overlap',
    });
    expect(state.availability).toHaveLength(1);
  });

  it('restores a recurring window gap when date-specific remainders override the rule', async () => {
    const metadata = { subject_ids: ['subject1', 'subject2'], meeting_link: 'https://meet.example/original', public_bookable: true };
    const { supabase, state } = mockSupabase([
      recurring('14:00', '17:00', metadata),
      specific('14:00', '15:00', metadata),
      specific('16:00', '17:00', metadata),
    ]);
    expect(await releaseSessionSlotAsAvailability(supabase as never, session)).toEqual({ created: true });
    expect(timeRanges(state.availability.filter((row) => !row.is_recurring)))
      .toEqual(['14:00-15:00', '15:00-16:00', '16:00-17:00']);
    expect(state.availability.find((row) => row.start_time === '15:00')).toMatchObject(metadata);
  });

  it('preserves other recurring windows when creating the first date-specific row', async () => {
    const { supabase, state } = mockSupabase([
      recurring('09:00', '12:00', { subject_ids: ['morning'], public_bookable: true }),
      recurring('16:00', '17:00', { meeting_link: 'https://meet.example/evening' }),
    ], [{
      id: 'morning-lesson', tutor_id: 't1', status: 'active',
      start_time: '2026-05-21T07:00:00.000Z', end_time: '2026-05-21T08:00:00.000Z',
    }]);

    await releaseSessionSlotAsAvailability(supabase as never, session);
    const restored = state.availability.filter((row) => !row.is_recurring);
    expect(timeRanges(restored)).toEqual(['09:00-10:00', '11:00-12:00', '15:00-16:00', '16:00-17:00']);
    expect(restored.find((row) => row.start_time === '09:00')).toMatchObject({ subject_ids: ['morning'], public_bookable: true });
    expect(restored.find((row) => row.start_time === '16:00')).toMatchObject({ meeting_link: 'https://meet.example/evening' });
  });

  it('does not free a group slot until its remaining active participant is removed', async () => {
    const { supabase, state } = mockSupabase([], [{
      id: 'participant2', tutor_id: 't1', status: 'active',
      start_time: session.startTime, end_time: session.endTime,
    }]);
    expect(await releaseSessionSlotAsAvailability(supabase as never, session)).toEqual({
      created: false, skippedReason: 'occupied',
    });
    expect(state.availability).toHaveLength(0);

    state.sessions = [];
    expect(await releaseSessionSlotAsAvailability(supabase as never, session)).toEqual({ created: true });
    expect(state.availability).toHaveLength(1);
  });

  it('ignores cancelled lessons and the rows selected for deletion', async () => {
    const { supabase, state } = mockSupabase([], [
      { id: 'cancelled', tutor_id: 't1', status: 'cancelled', start_time: session.startTime, end_time: session.endTime },
      { id: 'selected', tutor_id: 't1', status: 'active', start_time: session.startTime, end_time: session.endTime },
    ]);
    await releaseSessionSlotAsAvailability(supabase as never, { ...session, ignoredSessionIds: ['selected'] });
    expect(timeRanges(state.availability)).toEqual(['15:00-16:00']);
  });

  it('does not use an expired or not-yet-started recurring rule as coverage', async () => {
    const { supabase, state } = mockSupabase([
      recurring('14:00', '17:00', { id: 'expired', end_date: '2026-05-20' }),
      recurring('14:00', '17:00', { id: 'future', start_date: '2026-05-22' }),
    ]);
    await releaseSessionSlotAsAvailability(supabase as never, session);
    expect(timeRanges(state.availability.filter((row) => !row.is_recurring))).toEqual(['15:00-16:00']);
  });

  it('reads original availability settings beyond the 1000-row cap and ignores other dates', async () => {
    const original = specific('14:00', '15:00', {
      id: 'z-original', subject_ids: ['subject1', 'subject2'],
      meeting_link: 'https://meet.example/original', public_bookable: true,
    });
    const sameDateRows = Array.from({ length: 1001 }, (_, index) => specific('08:00', '08:15', {
      id: `a-${String(index).padStart(4, '0')}`,
    }));
    const otherDateRows = Array.from({ length: 600 }, (_, index) => specific('12:00', '13:00', {
      id: `b-${index}`, specific_date: '2026-05-22',
    }));
    const { supabase, state, readPages } = mockSupabase([original, ...otherDateRows, ...sameDateRows]);

    await releaseSessionSlotAsAvailability(supabase as never, session);
    expect(readPages.availability).toBe(3);
    expect(state.availability.filter((row) => row.start_time === '15:00')).toEqual([
      expect.objectContaining({
        subject_ids: ['subject1', 'subject2'],
        meeting_link: original.meeting_link, public_bookable: true,
      }),
    ]);
  });

  it('keeps a remaining group participant occupied beyond the 1000-row cap', async () => {
    const selected = Array.from({ length: 1001 }, (_, index) => ({
      id: `a-${String(index).padStart(4, '0')}`, tutor_id: 't1', status: 'active',
      start_time: session.startTime, end_time: session.endTime,
    }));
    const remaining = {
      id: 'z-remaining', tutor_id: 't1', status: 'active',
      start_time: session.startTime, end_time: session.endTime,
    };
    const { supabase, state, readPages } = mockSupabase([], [remaining, ...selected]);
    expect(await releaseSessionSlotAsAvailability(supabase as never, {
      ...session, ignoredSessionIds: selected.map((row) => row.id),
    })).toEqual({ created: false, skippedReason: 'occupied' });
    expect(readPages.sessions).toBe(3);
    expect(state.availability).toEqual([]);
  });

  it('rejects invalid and past lesson ranges without reading or writing availability', async () => {
    const { supabase } = mockSupabase();
    expect(await releaseSessionSlotAsAvailability(supabase as never, { ...session, startTime: 'invalid' }))
      .toEqual({ created: false, skippedReason: 'invalid_range' });
    expect(await releaseSessionSlotAsAvailability(supabase as never, { ...session, endTime: session.startTime }))
      .toEqual({ created: false, skippedReason: 'invalid_range' });
    expect(await releaseSessionSlotAsAvailability(supabase as never, {
      ...session, startTime: '2026-04-01T12:00:00.000Z', endTime: '2026-04-01T13:00:00.000Z',
    })).toEqual({ created: false, skippedReason: 'past' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('fails instead of exposing a slot when the occupancy query fails', async () => {
    const insert = vi.fn();
    const error = { message: 'occupancy unavailable' };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'availability') {
          const query = { eq: () => query, or: () => query, order: () => query, range: async () => ({ data: [], error: null }) };
          return { select: () => query, insert };
        }
        const query = { eq: () => query, lt: () => query, gt: () => query, order: () => query, range: async () => ({ data: null, error }) };
        return { select: () => query };
      }),
    };
    await expect(releaseSessionSlotAsAvailability(supabase as never, session)).rejects.toEqual(error);
    expect(insert).not.toHaveBeenCalled();
  });
});
