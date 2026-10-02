import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'admin',
  admin: null as any,
  session: null as any,
  tutor: null as any,
  pendingSessions: [] as any[],
  stampIds: [] as string[],
  emailStatus: 200,
  emailCalls: 0,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.userId ? { id: state.userId } : null },
        error: null,
      }),
    },
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        is: () => query,
        lt: () => query,
        gte: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        update: (value: any) => {
          query._update = value;
          return {
            in: (_field: string, ids: string[]) => {
              state.stampIds = ids;
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        maybeSingle: async () => {
          if (table === 'sessions' && query._update) {
            return { data: null, error: null };
          }
          if (table === 'sessions') return { data: { ...state.session }, error: null };
          if (table === 'profiles') return { data: { ...state.tutor }, error: null };
          if (table === 'organizations') return { data: { preferred_locale: 'lt' }, error: null };
          return { data: null, error: null };
        },
        then: undefined,
      };
      query.in = (field: string, ids: string[]) => {
        if (field === 'id') query._inIds = ids;
        return query;
      };
      Object.defineProperty(query, 'then', {
        get() {
          if (table === 'sessions' && !query._update) {
            return (resolve: (value: unknown) => void) => resolve({ data: state.pendingSessions, error: null });
          }
          if (table === 'students') {
            return (resolve: (value: unknown) => void) => resolve({
              data: [{ id: 'student-1', full_name: 'Emilija' }],
              error: null,
            });
          }
          return undefined;
        },
      });
      return query;
    },
  }),
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: async () => state.admin,
}));

const fetchMock = vi.fn(async () => {
  state.emailCalls += 1;
  return { ok: state.emailStatus === 200, status: state.emailStatus, text: async () => '' };
});
vi.stubGlobal('fetch', fetchMock);

import handler from '../../api/remind-tutor-session-status';
import { PRO_KLASE_ORG_ID } from '../../api/_lib/marketMoney';

async function run(sessionId = 'session-1') {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer test' },
    body: { sessionId },
  } as any, response);
  return response;
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.APP_URL = 'https://tutlio.lt';
  state.userId = 'admin';
  state.admin = {
    organizationId: PRO_KLASE_ORG_ID,
    role: 'admin',
    permissions: { 'sessions.edit': true },
  };
  state.session = {
    id: 'session-1',
    tutor_id: 'tutor-1',
    student_id: 'student-1',
    start_time: '2020-01-01T10:00:00Z',
    end_time: '2020-01-01T11:00:00Z',
    status: 'active',
    status_confirmed_at: null,
    status_reminder_last_sent_at: null,
  };
  state.tutor = {
    id: 'tutor-1',
    full_name: 'Airida',
    email: 'airida@example.com',
    preferred_locale: 'lt',
    organization_id: PRO_KLASE_ORG_ID,
  };
  state.pendingSessions = [{ ...state.session }];
  state.stampIds = [];
  state.emailStatus = 200;
  state.emailCalls = 0;
  fetchMock.mockClear();
});

describe('remind-tutor-session-status', () => {
  it('sends the existing status-confirmation email digest for Pro Klasė admins', async () => {
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(state.emailCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/send-email'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('lesson_status_confirmation_reminder'),
      }),
    );
    expect(state.stampIds).toEqual(['session-1']);
  });

  it('rejects non-Pro-Klasė admins and already-confirmed sessions', async () => {
    state.admin.organizationId = 'other-org';
    expect((await run()).status).toHaveBeenCalledWith(403);

    state.admin.organizationId = PRO_KLASE_ORG_ID;
    state.session.status_confirmed_at = '2020-01-01T12:00:00Z';
    expect((await run()).status).toHaveBeenCalledWith(409);
  });

  it('rate-limits manual reminders to once per hour per session stamp window', async () => {
    state.session.status_reminder_last_sent_at = new Date().toISOString();
    expect((await run()).status).toHaveBeenCalledWith(429);
    expect(state.emailCalls).toBe(0);
  });
});
