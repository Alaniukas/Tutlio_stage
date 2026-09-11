import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  patch: null as Record<string, unknown> | null,
  session: null as any,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const query: any = {
        select: () => query,
        update: (patch: Record<string, unknown>) => {
          state.patch = patch;
          return query;
        },
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({ data: state.session, error: null }),
      };
      return query;
    },
  }),
}));

vi.mock('../../api/_lib/joinLink.js', () => ({
  isJoinRole: () => true,
  verifyJoinToken: () => true,
}));
vi.mock('../../api/_lib/public-origin.js', () => ({ publicOriginFromRequest: () => 'https://tutlio.lt' }));
vi.mock('../../api/_lib/sessionMeetingLink.js', () => ({
  resolveSessionMeetingLinkFromDb: async () => 'https://meet.example.com/class',
}));
vi.mock('../../src/lib/attendance.js', () => ({ isWithinJoinClickWindow: () => true }));

import handler from '../../api/join-session';

describe('tracked late join correction', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    state.patch = null;
    state.session = {
      id: 'session',
      tutor_id: 'teacher',
      start_time: '2026-09-09T09:00:00Z',
      end_time: '2026-09-09T10:00:00Z',
      status: 'no_show',
      meeting_link: 'https://meet.example.com/class',
      tutor_joined_at: '2026-09-09T08:58:00Z',
      student_joined_at: null,
      status_confirmed_at: null,
      no_show_reason: 'missed_join',
      tutor_comment: 'Pamokos pastaba.\nMokinys neatvyko (pamokos metu).',
    };
  });

  it('reopens an automatic no-show when the student uses the tracked link during the lesson', async () => {
    const response: any = { redirect: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), send: vi.fn() };

    await handler({ method: 'GET', query: { sid: 'session', role: 'student', t: 'token' } } as any, response);

    expect(state.patch).toMatchObject({
      student_joined_at: expect.any(String),
      status: 'active',
      no_show_reason: null,
      no_show_when: null,
      tutor_comment: 'Pamokos pastaba.',
    });
    expect(response.redirect).toHaveBeenCalledWith(302, 'https://meet.example.com/class');
  });

  it('does not overwrite a human-confirmed no-show', async () => {
    state.session.status_confirmed_at = '2026-09-09T09:12:00Z';
    const response: any = { redirect: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), send: vi.fn() };

    await handler({ method: 'GET', query: { sid: 'session', role: 'student', t: 'token' } } as any, response);

    expect(state.patch).toEqual({ student_joined_at: expect.any(String) });
  });
});
