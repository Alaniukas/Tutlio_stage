import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consumeSessionSlotAvailability } from '@/lib/consumeSessionAvailability';

type Row = Record<string, unknown>;

function mockSupabase(rows: Row[]) {
  const state = { rows: [...rows] };
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
      select: vi.fn(() => selectApi),
      update: vi.fn((patch: Row) => ({
        eq: vi.fn(async (col: string, id: string) => {
          const idx = state.rows.findIndex((r) => r[col] === id);
          if (idx >= 0) state.rows[idx] = { ...state.rows[idx], ...patch };
          return { error: null };
        }),
      })),
      insert: vi.fn(async (payload: Row | Row[]) => {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const row of list) {
          state.rows.push({ id: `new-${state.rows.length}`, ...row });
        }
        return { error: null };
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
});
