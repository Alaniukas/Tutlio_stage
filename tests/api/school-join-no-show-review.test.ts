import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      if (table === 'sessions') {
        const now = Date.now();
        const query: any = {
          select: () => query,
          eq: () => query,
          not: () => query,
          is: () => query,
          lt: () => query,
          gte: () => query,
          update: state.update,
          limit: async () => ({
            data: [{
              id: 'session',
              tutor_id: 'teacher',
              start_time: new Date(now - 20 * 60_000).toISOString(),
              end_time: new Date(now + 25 * 60_000).toISOString(),
              status: 'active',
              meeting_link: 'https://meet.example.com/class',
              student_joined_at: null,
              tutor_joined_at: new Date(now - 19 * 60_000).toISOString(),
            }],
            error: null,
          }),
        };
        return query;
      }
      if (table === 'profiles') {
        const query: any = {
          select: () => query,
          in: async () => ({ data: [{ id: 'teacher', organization_id: 'school' }], error: null }),
        };
        return query;
      }
      const query: any = {
        select: () => query,
        in: async () => ({ data: [{ id: 'school', features: { school_join_no_show: true } }], error: null }),
      };
      return query;
    },
  }),
}));

vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));

import handler from '../../api/school-join-no-show';

describe('school join attendance review', () => {
  beforeEach(() => state.update.mockClear());

  it('reports a missing tracked click for review without writing a final no-show', async () => {
    const response: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler({ method: 'GET' } as any, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      updated: 0,
      awaitingReview: 1,
    }));
    expect(state.update).not.toHaveBeenCalled();
  });
});
