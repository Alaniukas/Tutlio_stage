import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pickNearestSession,
  sendFirstLessonInvite,
  type InviteCandidateSession,
} from '../../api/_lib/extraLessonsFirstLessonInvite';
import type { ExtraLessonsOrderSnapshot } from '../../src/lib/extraLessonsContract';

const NOW = '2026-09-05T08:00:00.000Z';

function row(overrides: Partial<InviteCandidateSession>): InviteCandidateSession {
  return {
    id: 'x',
    start_time: '2026-09-08T13:00:00.000Z',
    end_time: '2026-09-08T13:45:00.000Z',
    status: 'active',
    meeting_link: 'https://meet.google.com/abc',
    tutor_id: 't1',
    class_group_id: 'g1',
    ...overrides,
  };
}

describe('pickNearestSession', () => {
  it('takes the first upcoming active lesson on/after the service start, preferring the contract group', () => {
    const rows = [
      row({ id: 'past', start_time: '2026-09-04T13:00:00.000Z' }),
      row({ id: 'cancelled', status: 'cancelled', start_time: '2026-09-06T13:00:00.000Z' }),
      row({ id: 'other-group-sooner', class_group_id: 'g2', start_time: '2026-09-07T13:00:00.000Z' }),
      row({ id: 'group-later', class_group_id: 'g1', start_time: '2026-09-08T13:00:00.000Z' }),
    ];
    expect(pickNearestSession(rows, { nowIso: NOW, serviceStartYmd: '2026-09-05', groupId: 'g1' })?.id).toBe('group-later');
    expect(pickNearestSession(rows, { nowIso: NOW, serviceStartYmd: '2026-09-05', groupId: null })?.id).toBe('other-group-sooner');
  });

  it('respects the 14-day wait: nothing before the service start day', () => {
    const rows = [row({ id: 'a', start_time: '2026-09-08T13:00:00.000Z' }), row({ id: 'b', start_time: '2026-09-22T13:00:00.000Z' })];
    expect(pickNearestSession(rows, { nowIso: NOW, serviceStartYmd: '2026-09-19', groupId: 'g1' })?.id).toBe('b');
    expect(pickNearestSession(rows, { nowIso: NOW, serviceStartYmd: '2026-10-01', groupId: 'g1' })).toBeNull();
  });
});

function fakeSupabase(sessions: InviteCandidateSession[]) {
  const builder = (table: string) => {
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lte: () => api, gt: () => api, in: () => api,
      order: () => api, limit: () => api, neq: () => api, not: () => api,
      maybeSingle: async () => {
        if (table === 'profiles') return { data: { full_name: 'Demo Mokytoja Ana' }, error: null };
        if (table === 'school_class_groups') return { data: null, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (v: any) => unknown) => resolve({ data: table === 'sessions' ? sessions : [], error: null }),
    };
    return api;
  };
  return { from: builder } as any;
}

const order: ExtraLessonsOrderSnapshot = {
  service_type: 'group',
  group_id: 'g1',
  start_date: '2026-09-01',
  end_date: '2027-06-15',
  schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
  base_lessons_per_month: 8,
  unit_price_eur: 18,
  indicative_monthly_eur: 144,
  revision_label: '2026-08-19',
} as unknown as ExtraLessonsOrderSnapshot;

describe('sendFirstLessonInvite', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
    process.env.APP_URL = 'https://tutlio.lt';
    process.env.TUTLIO_DEV_API_LOCAL = '';
  });

  it('emails the nearest lesson with a join link, homework page and no account talk', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 })) as any;
    const result = await sendFirstLessonInvite(
      fakeSupabase([row({ id: 'sess-1', start_time: '2026-09-08T13:00:00.000Z' })]),
      { headers: { host: 'tutlio.lt' }, query: {}, method: 'POST' } as any,
      {
        contractId: 'c1',
        contractNumber: 'PP-1',
        organizationId: 'org1',
        schoolName: 'Demo Mokykla',
        studentId: 'student-1',
        studentName: 'Austėja Mockutė',
        parentName: 'Tėvas',
        payerEmail: 'parent@example.com',
        order,
        acceptedAtIso: NOW,
        startWithin14Status: 'yes',
        classGroupId: 'g1',
      },
      { fetchImpl, now: new Date(NOW) },
    );
    expect(result).toMatchObject({ sent: true, sessionId: 'sess-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://tutlio.lt/api/send-email');
    const body = JSON.parse(init.body);
    expect(body.type).toBe('school_extra_first_lesson_invite');
    expect(body.to).toBe('parent@example.com');
    expect(body.data).toMatchObject({
      organizationId: 'org1',
      sessionId: 'sess-1',
      date: '2026-09-08',
      time: '16:00',
      duration: 45,
      tutorName: 'Demo Mokytoja Ana',
      meetingLink: 'https://meet.google.com/abc',
      waitsFor14Days: false,
    });
    expect(String(body.data.homeworkUrl)).toMatch(/^https:\/\/tutlio\.lt\/school-homework\?student=student-1&t=[a-f0-9]{40}$/);
  });

  it('still invites (planned schedule, no join link) when no lesson row exists yet', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 })) as any;
    const result = await sendFirstLessonInvite(
      fakeSupabase([]),
      { headers: { host: 'tutlio.lt' }, query: {}, method: 'POST' } as any,
      {
        contractId: 'c1', contractNumber: 'PP-1', organizationId: 'org1', schoolName: 'Demo Mokykla',
        studentId: 'student-1', studentName: 'A', parentName: null, payerEmail: 'parent@example.com',
        order, acceptedAtIso: NOW, startWithin14Status: 'no', classGroupId: null,
      },
      { fetchImpl, now: new Date(NOW) },
    );
    expect(result.sent).toBe(true);
    expect(result.sessionId).toBeNull();
    expect(result.serviceStartYmd).toBe('2026-09-19');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.data.sessionId).toBeUndefined();
    expect(body.data.waitsFor14Days).toBe(true);
    expect(body.data.scheduleLabel).toContain('16:00');
  });

  it('does nothing without a payer email', async () => {
    const fetchImpl = vi.fn();
    const result = await sendFirstLessonInvite(fakeSupabase([]), { headers: {}, query: {}, method: 'POST' } as any, {
      contractId: 'c1', contractNumber: null, organizationId: 'org1', schoolName: null, studentId: 's',
      studentName: null, parentName: null, payerEmail: '', order, acceptedAtIso: NOW, startWithin14Status: 'na', classGroupId: null,
    }, { fetchImpl });
    expect(result.sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
