import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, subDays } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';
import { loadCancelledCalendarSessions } from '@/lib/cancelledCalendarSessions';

const now = new Date('2026-09-28T10:00:00Z');
const row = (index: number) => ({
  id: `cancelled-${index}`,
  tutor_id: 'tutor',
  student_id: 'student',
  start_time: '2026-10-01T14:00:00Z',
  end_time: '2026-10-01T15:00:00Z',
  status: 'cancelled',
  paid: false,
  hidden_from_calendar: true,
  recurring_session_id: 'yearly-lessons',
});

function mockClient(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(),
  };
  for (const page of pages) query.range.mockResolvedValueOnce(page);
  const client = { from: vi.fn(() => query) };
  return { client: client as unknown as Pick<SupabaseClient, 'from'>, from: client.from, query };
}

describe('cancelled tutor calendar cleanup list', () => {
  it('loads hidden cancellations past the default1000 row cap in stable500 row pages', async () => {
    const { client, from, query } = mockClient([
      { data: Array.from({ length: 500 }, (_, index) => row(index)), error: null },
      { data: Array.from({ length: 500 }, (_, index) => row(index + 500)), error: null },
      { data: [row(1000)], error: null },
    ]);

    const result = await loadCancelledCalendarSessions(client, 'tutor', now);

    expect(result).toHaveLength(1001);
    expect(result[1000]).toMatchObject({
      id: 'cancelled-1000', hidden_from_calendar: true, recurring_session_id: 'yearly-lessons',
      start_time: new Date('2026-10-01T14:00:00Z'), end_time: new Date('2026-10-01T15:00:00Z'),
    });
    expect(from.mock.calls).toEqual([['sessions'], ['sessions'], ['sessions']]);
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(query.eq.mock.calls).toEqual(Array.from({ length: 3 }, () => [
      ['tutor_id', 'tutor'], ['status', 'cancelled'],
    ]).flat());
    expect(query.order.mock.calls).toEqual(Array.from({ length: 3 }, () => [
      ['start_time', { ascending: false }], ['id', { ascending: true }],
    ]).flat());
    expect(query.gte).toHaveBeenCalledWith('start_time', subDays(now, 420).toISOString());
    expect(query.lte).toHaveBeenCalledWith('start_time', addDays(now, 460).toISOString());
  });

  it('checks for another page when the last page has exactly500 rows', async () => {
    const { client, query } = mockClient([
      { data: Array.from({ length: 500 }, (_, index) => row(index)), error: null },
      { data: [], error: null },
    ]);
    expect(await loadCancelledCalendarSessions(client, 'tutor', now)).toHaveLength(500);
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it('returns an empty list without querying unbounded history', async () => {
    const { client, query } = mockClient([{ data: null, error: null }]);
    expect(await loadCancelledCalendarSessions(client, 'tutor', now)).toEqual([]);
    expect(query.range).toHaveBeenCalledTimes(1);
    expect(query.gte).toHaveBeenCalledTimes(1);
    expect(query.lte).toHaveBeenCalledTimes(1);
  });

  it('rejects a later page failure instead of showing an incomplete cleanup list', async () => {
    const { client } = mockClient([
      { data: Array.from({ length: 500 }, (_, index) => row(index)), error: null },
      { data: null, error: { message: 'Permission denied' } },
    ]);
    await expect(loadCancelledCalendarSessions(client, 'tutor', now)).rejects.toThrow('Permission denied');
  });
});
