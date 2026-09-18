import { describe, it, expect, vi, beforeEach } from 'vitest';
import { format } from 'date-fns';
import {
  consumeAvailabilityForCreatedSessions,
} from '@/lib/consumeSessionAvailability';
import { assertTutorSlotsFree } from '@/pages/company/orgAdminSessionCreate';

const LATENCY_MS = 8;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRecurringSessions(count: number) {
  const sessions: Array<{ start_time: string; end_time: string }> = [];
  const base = new Date('2026-09-15T09:00:00.000Z');
  for (let i = 0; i < count; i++) {
    const start = new Date(base.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    sessions.push({ start_time: start.toISOString(), end_time: end.toISOString() });
  }
  return sessions;
}

function buildRecurringSlots(count: number) {
  const slots: Array<{ start: Date; end: Date }> = [];
  const base = new Date('2026-09-15T09:00:00.000Z');
  for (let i = 0; i < count; i++) {
    const start = new Date(base.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    slots.push({ start, end });
  }
  return slots;
}

function mockAvailabilitySupabase(sessionCount: number) {
  const metrics = { selectCalls: 0, writes: 0, activeWrites: 0, maxConcurrentWrites: 0 };
  const rows = [{
    id: 'a1',
    tutor_id: 't1',
    is_recurring: true,
    specific_date: null,
    day_of_week: 2,
    start_time: '08:00',
    end_time: '20:00',
    subject_ids: [],
  }];

  const writeWithLatency = async () => {
    metrics.writes += 1;
    metrics.activeWrites += 1;
    metrics.maxConcurrentWrites = Math.max(metrics.maxConcurrentWrites, metrics.activeWrites);
    await sleep(LATENCY_MS);
    metrics.activeWrites -= 1;
  };

  const from = vi.fn((table: string) => {
    if (table !== 'availability') throw new Error(`unexpected table ${table}`);
    const filters: Record<string, unknown> = {};
    const filteredRows = () => rows.filter((r) =>
      Object.entries(filters).every(([col, val]) => (r as Record<string, unknown>)[col] === val),
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
        return async (resolve: (v: { data: typeof rows; error: null }) => void) => {
          metrics.selectCalls += 1;
          await sleep(LATENCY_MS);
          resolve({ data: filteredRows(), error: null });
        };
      },
    });
    return {
      select: vi.fn(() => selectApi),
      update: vi.fn(() => ({
        eq: vi.fn(async () => {
          await writeWithLatency();
          return { error: null };
        }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => {
            await writeWithLatency();
            return { data: { id: `new-${metrics.writes}` }, error: null };
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async () => {
          await writeWithLatency();
          return { error: null };
        }),
      })),
    };
  });

  return {
    supabase: { from },
    metrics,
    sessions: buildRecurringSessions(sessionCount),
  };
}

function mockSessionsSupabase(slotCount: number) {
  const metrics = { selectCalls: 0 };
  const slots = buildRecurringSlots(slotCount);

  const from = vi.fn((table: string) => {
    if (table !== 'sessions') throw new Error(`unexpected table ${table}`);
    const chain: Record<string, unknown> = {};
    const api = {
      eq: vi.fn((col: string, val: unknown) => {
        chain[col] = val;
        return api;
      }),
      lt: vi.fn((col: string, val: unknown) => {
        chain[`${col}_lt`] = val;
        return api;
      }),
      gt: vi.fn((col: string, val: unknown) => {
        chain[`${col}_gt`] = val;
        return api;
      }),
      limit: vi.fn(async () => {
        metrics.selectCalls += 1;
        await sleep(LATENCY_MS);
        return { data: [], error: null };
      }),
      then: undefined as unknown,
    };
    Object.defineProperty(api, 'then', {
      get() {
        return async (resolve: (v: { data: []; error: null }) => void) => {
          metrics.selectCalls += 1;
          await sleep(LATENCY_MS);
          resolve({ data: [], error: null });
        };
      },
    });
    return { select: vi.fn(() => api) };
  });

  return { supabase: { from }, metrics, slots };
}

async function legacyAssertTutorSlotsFree(
  supabase: { from: ReturnType<typeof vi.fn> },
  tutorId: string,
  slots: Array<{ start: Date; end: Date }>,
) {
  const seen = new Set<string>();
  for (const { start, end } of slots) {
    const key = `${start.getTime()}_${end.getTime()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('status', 'active')
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
      .limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) {
      throw new Error(`conflict ${format(start, 'yyyy-MM-dd HH:mm')}`);
    }
  }
}

async function legacyConsumeAvailability(
  supabase: { from: ReturnType<typeof vi.fn> },
  tutorId: string,
  sessions: Array<{ start_time: string; end_time: string }>,
) {
  const { consumeSessionSlotAvailability } = await import('@/lib/consumeSessionAvailability');
  for (const session of sessions) {
    await consumeSessionSlotAvailability(supabase as never, {
      tutorId,
      startTime: session.start_time,
      endTime: session.end_time,
    });
  }
}

describe('session create performance (mocked network latency)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('assertTutorSlotsFree uses one overlap query for many slots', async () => {
    const slotCount = 30;
    const { supabase, metrics, slots } = mockSessionsSupabase(slotCount);
    const started = performance.now();
    await assertTutorSlotsFree(supabase as never, 't1', slots);
    const elapsedMs = performance.now() - started;

    expect(metrics.selectCalls).toBe(1);
    // ~30× fewer round trips than legacy (see next test): ~8ms vs ~240ms at 8ms latency.
    expect(elapsedMs).toBeLessThan(LATENCY_MS * slotCount * 0.25);
  });

  it('legacy overlap check was one query per slot', async () => {
    const slotCount = 30;
    const { supabase, metrics, slots } = mockSessionsSupabase(slotCount);
    const started = performance.now();
    await legacyAssertTutorSlotsFree(supabase as never, 't1', slots);
    const elapsedMs = performance.now() - started;

    expect(metrics.selectCalls).toBe(slotCount);
    expect(elapsedMs).toBeGreaterThanOrEqual(LATENCY_MS * slotCount * 0.8);
  });

  it('batch availability consume loads tutor availability once', async () => {
    const sessionCount = 30;
    const { supabase, metrics, sessions } = mockAvailabilitySupabase(sessionCount);
    await consumeAvailabilityForCreatedSessions(supabase as never, 't1', sessions);

    expect(metrics.selectCalls).toBe(1);
    // Different dates are independent, so their remainder writes do not wait
    // for every previous week in a school-year series.
    expect(metrics.maxConcurrentWrites).toBeGreaterThan(1);
    expect(metrics.maxConcurrentWrites).toBeLessThanOrEqual(6);
    expect(metrics.selectCalls).toBeLessThan(sessionCount);
  });

  it('legacy per-session availability consume reloaded availability each time', async () => {
    const sessionCount = 30;
    const { supabase, metrics, sessions } = mockAvailabilitySupabase(sessionCount);
    await legacyConsumeAvailability(supabase as never, 't1', sessions);

    expect(metrics.selectCalls).toBe(sessionCount);
  });
});
