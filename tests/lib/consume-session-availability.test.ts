import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  consumeAvailabilityForCreatedSessions,
  consumeSessionSlotAvailability,
} from '@/lib/consumeSessionAvailability';
import { sliceTimeRangeBySessions } from '@/lib/availabilityCalendarBlocks';
import { computeTutorSlots } from '@/lib/tutorMatching';
import { bookableAvailabilitySlotsOnDate } from '@/lib/availabilityBooking';

type Row = Record<string, unknown>;

function mockSupabase(rows: Row[]) {
  const state = { rows: [...rows], selectCalls: 0 };
  const from = vi.fn((table: string) => {
    if (table !== 'availability') throw new Error(`unexpected table ${table}`);
    const filters: Record<string, unknown> = {};
    const filteredRows = () =>
      state.rows.filter((r) =>
        Object.entries(filters).every(([col, val]) => r[col] === val),
      );
    const selectApi = {
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val;
        return selectApi;
      }),
      then: undefined as unknown,
    };
    Object.defineProperty(selectApi, 'then', {
      get() {
        return (resolve: (v: { data: Row[]; error: null }) => void) =>
          resolve({ data: filteredRows(), error: null });
      },
    });
    return {
      select: vi.fn(() => {
        state.selectCalls += 1;
        return selectApi;
      }),
      update: vi.fn((patch: Row) => ({
        eq: vi.fn(async (col: string, id: string) => {
          const idx = state.rows.findIndex((r) => r[col] === id);
          if (idx >= 0) state.rows[idx] = { ...state.rows[idx], ...patch };
          return { error: null };
        }),
      })),
      insert: vi.fn((payload: Row | Row[]) => {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted = list.map((row, index) => ({ id: `new-${state.rows.length + index}`, ...row }));
        for (const row of inserted) {
          state.rows.push(row);
        }
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: inserted[0] ?? null, error: null })),
          })),
        };
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(async (col: string, id: string) => {
          state.rows = state.rows.filter((r) => r[col] !== id);
          return { error: null };
        }),
      })),
    };
  });
  return { supabase: { from }, state };
}

describe('consumeSessionSlotAvailability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a one-time availability block after a lesson at the start', async () => {
    const { supabase, state } = mockSupabase([
      {
        id: 'a1',
        tutor_id: 't1',
        is_recurring: false,
        specific_date: '2026-05-21',
        start_time: '12:00',
        end_time: '13:00',
        subject_ids: [],
      },
    ]);

    await consumeSessionSlotAvailability(supabase as never, {
      tutorId: 't1',
      startTime: '2026-05-21T09:00:00.000Z',
      endTime: '2026-05-21T09:45:00.000Z',
    });

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].start_time).toBe('12:00');
    expect(state.rows[0].end_time).toBe('13:00');
  });

  it('preserves a fully booked source and reveals it unchanged when the lesson is deleted', async () => {
    const original = {
      id: 'a1', tutor_id: 't1', is_recurring: false,
      specific_date: '2026-05-21', day_of_week: null,
      start_time: '12:00', end_time: '13:00',
      subject_ids: ['subject1', 'subject2'],
      meeting_link: 'https://meet.example/original',
      public_bookable: true,
    };
    const { supabase, state } = mockSupabase([original]);
    const booked = {
      start_time: '2026-05-21T09:00:00.000Z',
      end_time: '2026-05-21T10:00:00.000Z',
      status: 'active',
    };
    await consumeSessionSlotAvailability(supabase as never, {
      tutorId: 't1', startTime: booked.start_time, endTime: booked.end_time,
    });
    expect(state.rows).toEqual([original]);

    const block = { start: new Date(booked.start_time), end: new Date(booked.end_time) };
    expect(sliceTimeRangeBySessions(block, [booked])).toEqual([]);
    expect(sliceTimeRangeBySessions(block, [])).toEqual([block]);
    expect(sliceTimeRangeBySessions(block, [{ ...booked, status: 'cancelled' }])).toEqual([block]);

    const params = { dateFrom: '2026-05-21', dateTo: '2026-05-21', timeFrom: '12:00', timeTo: '13:00' };
    const subjects = ['subject1', 'subject2'].map((id) => ({ id, tutor_id: 't1', name: id, price: 10, duration_minutes: 60 }));
    const busy = [{ tutor_id: 't1', start: new Date(2026, 4, 21, 12), end: new Date(2026, 4, 21, 13) }];
    expect(computeTutorSlots(state.rows as never, busy, subjects, { t1: 'Teacher' }, params)).toEqual([]);
    expect(computeTutorSlots(state.rows as never, [], subjects, { t1: 'Teacher' }, params).map((slot) => slot.subjectId))
      .toEqual(['subject1', 'subject2']);
  });

  it('adds a date-specific remainder row for recurring availability', async () => {
    const { supabase, state } = mockSupabase([
      {
        id: 'r1',
        tutor_id: 't1',
        is_recurring: true,
        day_of_week: 4,
        specific_date: null,
        start_time: '12:00',
        end_time: '13:00',
        subject_ids: ['subj'],
        public_bookable: true,
      },
    ]);

    await consumeSessionSlotAvailability(supabase as never, {
      tutorId: 't1',
      startTime: '2026-05-21T09:00:00.000Z',
      endTime: '2026-05-21T09:45:00.000Z',
    });

    expect(state.rows).toHaveLength(2);
    const added = state.rows.find((r) => r.id !== 'r1');
    expect(added?.is_recurring).toBe(false);
    expect(added?.specific_date).toBe('2026-05-21');
    expect(added?.start_time).toBe('12:45');
    expect(added?.end_time).toBe('13:00');
  });

  it('loads tutor availability once when consuming multiple sessions', async () => {
    const { supabase, state } = mockSupabase([
      {
        id: 'a1',
        tutor_id: 't1',
        is_recurring: false,
        specific_date: '2026-05-21',
        start_time: '08:00',
        end_time: '18:00',
        subject_ids: [],
      },
    ]);

    await consumeAvailabilityForCreatedSessions(supabase as never, 't1', [
      { start_time: '2026-05-21T09:00:00.000Z', end_time: '2026-05-21T09:45:00.000Z' },
      { start_time: '2026-05-21T10:00:00.000Z', end_time: '2026-05-21T10:45:00.000Z' },
    ]);

    expect(state.selectCalls).toBe(1);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ start_time: '08:00', end_time: '18:00' });
  });

  it('booking an evening lesson preserves a separate daytime window and its settings', async () => {
    const lunch = { id: 'lunch', tutor_id: 't1', is_recurring: true, day_of_week: 4,
      specific_date: null, start_time: '12:00', end_time: '16:00', subject_ids: ['math'],
      meeting_link: 'https://meet.example/lunch', public_bookable: false };
    const evening = { ...lunch, id: 'evening', start_time: '18:00', end_time: '21:00', subject_ids: ['physics'] };
    const { supabase, state } = mockSupabase([lunch, evening]);
    const lesson = { start_time: '2026-05-21T15:00:00Z', end_time: '2026-05-21T16:00:00Z', status: 'active' };
    await consumeSessionSlotAvailability(supabase as never, { tutorId: 't1', startTime: lesson.start_time, endTime: lesson.end_time });
    expect(state.rows.find(r => r.is_recurring === false && r.start_time === '12:00'))
      .toMatchObject({ end_time: '16:00', subject_ids: ['math'], meeting_link: lunch.meeting_link, public_bookable: false });
    const slots = bookableAvailabilitySlotsOnDate(state.rows as never, '2026-05-21', [lesson], {
      durationMs: 60 * 60000, earliest: new Date('2026-05-21T00:00:00'), subjectId: 'math',
    });
    expect(slots).toHaveLength(7);
    expect(state.rows.filter(r => r.is_recurring)).toEqual([lunch, evening]);
  });

  it('does not revive older weekly time hidden by a deliberate newer date override', async () => {
    const weekly = { id: 'weekly', tutor_id: 't1', is_recurring: true, day_of_week: 4,
      start_time: '12:00', end_time: '16:00', created_at: '2026-05-01T00:00:00Z' };
    const exception = { ...weekly, id: 'exception', is_recurring: false, specific_date: '2026-05-21',
      day_of_week: null, start_time: '14:00', end_time: '15:00', created_at: '2026-05-02T00:00:00Z' };
    const { supabase, state } = mockSupabase([weekly, exception]);
    await consumeSessionSlotAvailability(supabase as never, {
      tutorId: 't1', startTime: '2026-05-21T11:00:00Z', endTime: '2026-05-21T12:00:00Z',
    });
    expect(state.rows).toEqual([weekly, exception]);
  });

  it('preserves an uncovered extension when older one-time time partly covers a new weekly rule', async () => {
    const weekly = { id: 'weekly', tutor_id: 't1', is_recurring: true, day_of_week: 4,
      start_time: '12:00', end_time: '16:00', created_at: '2026-05-02T00:00:00Z' };
    const existing = { ...weekly, id: 'exception', is_recurring: false, specific_date: '2026-05-21',
      day_of_week: null, end_time: '14:00', created_at: '2026-05-01T00:00:00Z' };
    const evening = { ...weekly, id: 'evening', start_time: '18:00', end_time: '21:00' };
    const { supabase, state } = mockSupabase([weekly, existing, evening]);
    await consumeSessionSlotAvailability(supabase as never, {
      tutorId: 't1', startTime: '2026-05-21T15:00:00Z', endTime: '2026-05-21T16:00:00Z',
    });
    expect(state.rows.find(r => r.is_recurring === false && r.start_time === '14:00')).toMatchObject({ end_time: '16:00' });
    expect(state.rows.filter(r => r.is_recurring === false && r.start_time === '12:00')).toHaveLength(1);
  });
});
