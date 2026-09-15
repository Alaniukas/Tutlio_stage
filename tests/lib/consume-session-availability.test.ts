import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  consumeAvailabilityForCreatedSessions,
  consumeSessionSlotAvailability,
} from '@/lib/consumeSessionAvailability';

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

  it('shortens a one-time availability block after a lesson at the start', async () => {
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
    expect(state.rows[0].start_time).toBe('12:45');
    expect(state.rows[0].end_time).toBe('13:00');
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
    expect(state.rows).toHaveLength(3);
  });
});
