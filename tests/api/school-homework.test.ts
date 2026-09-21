import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  student: null as Record<string, unknown> | null,
  org: null as Record<string, unknown> | null,
  sessions: [] as Array<Record<string, unknown>>,
  contracts: [] as Array<Record<string, unknown>>,
  files: {} as Record<string, Array<{ name: string; metadata: { size: number } | null }>>,
  uploadPaths: [] as string[],
  removed: [] as string[][],
  recordingGroups: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  subjects: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../api/_lib/schoolHomeworkRecordings.js', () => ({
  schoolRecordingsFeatureOn: (features: Record<string, unknown> | null | undefined) =>
    features?.school_lesson_recordings === true,
  listHomeworkGroupRecordings: async () => ({ retentionDays: 30, groups: state.recordingGroups }),
}));

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const api: any = {
      select: () => api,
      eq: (col: string, v: unknown) => { filters.push([col, v]); return api; },
      neq: () => api, gte: () => api, lte: () => api, in: () => api, order: () => api, limit: () => api,
      maybeSingle: async () => {
        if (table === 'students') return { data: state.student, error: null };
        if (table === 'organizations') return { data: state.org, error: null };
        if (table === 'sessions') {
          const id = filters.find(([c]) => c === 'id')?.[1];
          const sid = filters.find(([c]) => c === 'student_id')?.[1];
          const row = state.sessions.find((s) => s.id === id && s.student_id === sid);
          return { data: row ?? null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (v: any) => unknown) => {
        if (table === 'sessions') {
          const sid = filters.find(([c]) => c === 'student_id')?.[1];
          return resolve({ data: sid ? state.sessions.filter((s) => s.student_id === sid) : state.sessions, error: null });
        }
        if (table === 'profiles') return resolve({ data: state.profiles, error: null });
        if (table === 'subjects') return resolve({ data: state.subjects, error: null });
        if (table === 'school_class_groups') return resolve({ data: [{ id: 'g1', name: 'QA Legal Matematika' }], error: null });
        if (table === 'school_class_group_members') {
          const sid = filters.find(([c]) => c === 'student_id')?.[1];
          return resolve({ data: sid === STUDENT ? [{ group_id: 'g1' }] : [], error: null });
        }
        if (table === 'school_contracts') return resolve({ data: state.contracts, error: null });
        return resolve({ data: [], error: null });
      },
    };
    return api;
  };
  const storage = {
    from: () => ({
      list: async (folder: string) => ({ data: state.files[folder] || [], error: null }),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })), error: null }),
      createSignedUploadUrl: async (path: string) => { state.uploadPaths.push(path); return { data: { token: 'tok-1', path }, error: null }; },
      remove: async (paths: string[]) => { state.removed.push(paths); return { data: null, error: null }; },
    }),
  };
  return { createClient: () => ({ from: builder, storage }) };
});

import handler, { homeworkObjectName, isAllowedHomeworkFile, siblingFolders, studentSlug } from '../../api/school-homework';
import { buildPublicLinkToken } from '../../api/_lib/publicLinkToken';

function mockRes() {
  const out: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    status(code: number) { out.statusCode = code; return this; },
    json(body: any) { out.body = body; return this; },
    setHeader() { return this; },
    getResult: () => out,
  };
}

const STUDENT = 'c3a00000-7e57-4000-8000-0000000000e1';
const token = () => buildPublicLinkToken('homework', STUDENT);

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  process.env.APP_URL = 'https://tutlio.lt';
  state.student = { id: STUDENT, full_name: 'Austėja Mockutė', organization_id: 'org1', detached_at: null, personal_meeting_link: null };
  state.profiles = [{ id: 't1', full_name: 'Demo Mokytoja Ana', personal_meeting_link: null }];
  state.subjects = [];
  state.org = { id: 'org1', name: 'Demo Mokykla', entity_type: 'school', features: {} };
  const inFuture = new Date(Date.now() + 3 * 86_400_000).toISOString();
  state.sessions = [
    { id: 'sess-1', student_id: STUDENT, start_time: inFuture, end_time: inFuture, status: 'active', meeting_link: 'https://meet.google.com/abc', tutor_id: 't1', class_group_id: 'g1', subject_id: null, topic: null },
    { id: 'sess-2', student_id: 'other', start_time: inFuture, end_time: inFuture, status: 'active', meeting_link: 'https://meet.google.com/abc', tutor_id: 't1', class_group_id: 'g1', subject_id: null, topic: null },
  ];
  state.contracts = [{ kind: 'annual', signing_status: 'signed', archived_at: null, terminated_at: null }];
  state.files = {
    'sess-2': [
      { name: 'uzduotys.pdf', metadata: { size: 1200 } },
      { name: 'nd-klasemate-svetimas.pdf', metadata: { size: 400 } },
    ],
    'sess-1': [{ name: 'nd-austeja-mockute-atsakymai.pdf', metadata: { size: 800 } }],
  };
  state.uploadPaths = [];
  state.removed = [];
  state.recordingGroups = [];
});

describe('helpers', () => {
  it('builds teacher-readable submission names and validates files', () => {
    expect(studentSlug('Austėja Mockutė')).toBe('austeja-mockute');
    expect(homeworkObjectName('Austėja Mockutė', 'Namų darbai (1).PDF')).toBe('nd-austeja-mockute-Namu_darbai_1.pdf');
    expect(isAllowedHomeworkFile('a.pdf', 10)).toBe(true);
    expect(isAllowedHomeworkFile('a.exe', 10)).toBe(false);
    expect(isAllowedHomeworkFile('a.pdf', 11 * 1024 * 1024)).toBe(false);
  });

  it('shares folders across the parallel rows of one group lesson', () => {
    const all = state.sessions as any;
    expect(siblingFolders(all[0], all)).toEqual(['sess-1', 'sess-2']);
    expect(siblingFolders({ ...all[0], class_group_id: null }, all)).toEqual(['sess-1']);
  });

  it('does not merge folders from a different class group at the same time', () => {
    const sameTime = new Date().toISOString();
    const mine = { id: 'mine', class_group_id: 'g1', start_time: sameTime };
    const other = { id: 'other', class_group_id: 'g2', start_time: sameTime };
    expect(siblingFolders(mine as any, [mine, other] as any)).toEqual(['mine']);
  });
});

describe('GET /api/school-homework', () => {
  it('rejects a bad token', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { student: STUDENT, t: 'nope' }, headers: {} } as any, res as any);
    expect(res.getResult().statusCode).toBe(403);
  });

  it('rejects students outside school orgs', async () => {
    state.org = { id: 'org1', name: 'Company', entity_type: 'company', features: {} };
    const res = mockRes();
    await handler({ method: 'GET', query: { student: STUDENT, t: token() }, headers: {} } as any, res as any);
    expect(res.getResult().statusCode).toBe(403);
  });

  it('lists the child lessons with teacher materials from sibling rows, own submissions and a tracked join link', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { student: STUDENT, t: token() }, headers: { host: 'tutlio.lt' } } as any, res as any);
    const out = res.getResult();
    expect(out.statusCode).toBe(200);
    expect(out.body.student).toEqual({ id: STUDENT, name: 'Austėja Mockutė' });
    expect(out.body.terminology).toEqual({ staff: true, activity: true });
    expect(out.body.sessions).toHaveLength(1);
    const s = out.body.sessions[0];
    expect(s.teacher).toBe('Demo Mokytoja Ana');
    expect(s.group).toBe('QA Legal Matematika');
    expect(s.joinUrl).toMatch(/\/api\/join-session\?sid=sess-1&role=student&t=/);
    const names = s.files.map((f: any) => [f.name, f.submission, f.own]);
    expect(names).toEqual(expect.arrayContaining([
      ['nd-austeja-mockute-atsakymai.pdf', true, true],
      ['uzduotys.pdf', false, false],
    ]));
    expect(s.files.map((f: any) => f.name)).not.toContain('nd-klasemate-svetimas.pdf');
    expect(s.files.find((f: any) => f.name === 'uzduotys.pdf').url).toBe('https://signed/sess-2/uzduotys.pdf');
    expect(out.body.recordingGroups).toEqual([]);
  });

  it('offers separate tracked links for overlapping lessons and resolves a teacher meeting link', async () => {
    const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
    state.profiles[0].personal_meeting_link = 'https://meet.google.com/teacher-room';
    state.sessions = [
      { id: 'lesson-a', student_id: STUDENT, start_time: start, end_time: start, status: 'active', meeting_link: null, tutor_id: 't1', class_group_id: 'g1', subject_id: null, topic: null },
      { id: 'lesson-b', student_id: STUDENT, start_time: start, end_time: start, status: 'active', meeting_link: 'https://meet.google.com/second-room', tutor_id: 't1', class_group_id: 'g1', subject_id: null, topic: null },
    ];
    state.files = {};
    const res = mockRes();
    await handler({ method: 'GET', query: { student: STUDENT, t: token() }, headers: { host: 'tutlio.lt' } } as any, res as any);
    const rows = res.getResult().body.sessions;
    expect(rows).toHaveLength(2);
    expect(rows.map((row: any) => row.joinUrl)).toEqual([
      expect.stringContaining('sid=lesson-a&role=student'),
      expect.stringContaining('sid=lesson-b&role=student'),
    ]);
    expect(rows.map((row: any) => row.hasMeetingLink)).toEqual([true, true]);
  });

  it('returns group Drive recordings on the public homework page', async () => {
    state.recordingGroups = [{
      id: 'g1',
      name: 'QA Legal Matematika',
      recordings: [{
        id: 'file-1',
        name: 'Pamoka.mp4',
        recordedAt: '2026-09-10T10:00:00Z',
        durationMillis: 60_000,
        size: 1_000,
        streamUrl: '/api/school-lesson-recording-stream?t=homework-ticket',
      }],
      loadError: null,
    }];
    const res = mockRes();
    await handler({ method: 'GET', query: { student: STUDENT, t: token() }, headers: { host: 'tutlio.lt' } } as any, res as any);
    const groups = res.getResult().body.recordingGroups;
    expect(groups).toHaveLength(1);
    expect(groups[0].recordings[0].streamUrl).toContain('/api/school-lesson-recording-stream?t=');
  });

  it('hides sessions for groups the child is not enrolled in', async () => {
    state.sessions = [
      { id: 'sess-1', student_id: STUDENT, start_time: new Date(Date.now() + 3 * 86_400_000).toISOString(), end_time: new Date(Date.now() + 3 * 86_400_000).toISOString(), status: 'active', meeting_link: null, tutor_id: 't1', class_group_id: 'g1', subject_id: null, topic: null },
      { id: 'sess-bad', student_id: STUDENT, start_time: new Date(Date.now() + 4 * 86_400_000).toISOString(), end_time: new Date(Date.now() + 4 * 86_400_000).toISOString(), status: 'active', meeting_link: null, tutor_id: 't1', class_group_id: 'g2', subject_id: null, topic: null },
    ];
    const res = mockRes();
    await handler({ method: 'GET', query: { student: STUDENT, t: token() }, headers: { host: 'tutlio.lt' } } as any, res as any);
    expect(res.getResult().body.sessions).toHaveLength(1);
    expect(res.getResult().body.sessions[0].id).toBe('sess-1');
  });

  it('keeps materials visible but hides the join action until the contract is active', async () => {
    state.contracts = [{ kind: 'annual', signing_status: 'sent', archived_at: null, terminated_at: null }];
    const res = mockRes();
    await handler({ method: 'GET', query: { student: STUDENT, t: token() }, headers: { host: 'tutlio.lt' } } as any, res as any);
    expect(res.getResult().body.sessions[0].joinUrl).toBeNull();
    expect(res.getResult().body.sessions[0].hasMeetingLink).toBe(true);
    expect(res.getResult().body.sessions[0].joinBlockedByContract).toBe(true);
  });
});

describe('POST /api/school-homework', () => {
  it('prepares a signed upload into the lesson folder under the nd- prefix', async () => {
    const res = mockRes();
    await handler({
      method: 'POST',
      body: { student: STUDENT, t: token(), action: 'upload-url', sessionId: 'sess-1', fileName: 'Atsakymai.pdf', size: 500 },
      headers: {},
      query: {},
    } as any, res as any);
    expect(res.getResult().statusCode).toBe(200);
    expect(res.getResult().body).toMatchObject({ ok: true, path: 'sess-1/nd-austeja-mockute-Atsakymai.pdf', token: 'tok-1' });
    expect(state.uploadPaths).toEqual(['sess-1/nd-austeja-mockute-Atsakymai.pdf']);
  });

  it('refuses uploads to lessons of other students, bad files, and deleting teacher files', async () => {
    const other = mockRes();
    await handler({ method: 'POST', body: { student: STUDENT, t: token(), action: 'upload-url', sessionId: 'sess-2', fileName: 'a.pdf', size: 5 }, headers: {}, query: {} } as any, other as any);
    expect(other.getResult().statusCode).toBe(404);

    const bad = mockRes();
    await handler({ method: 'POST', body: { student: STUDENT, t: token(), action: 'upload-url', sessionId: 'sess-1', fileName: 'virus.exe', size: 5 }, headers: {}, query: {} } as any, bad as any);
    expect(bad.getResult().statusCode).toBe(400);

    const del = mockRes();
    await handler({ method: 'POST', body: { student: STUDENT, t: token(), action: 'delete', sessionId: 'sess-1', fileName: 'uzduotys.pdf' }, headers: {}, query: {} } as any, del as any);
    expect(del.getResult().statusCode).toBe(403);
    expect(state.removed).toEqual([]);

    const ok = mockRes();
    await handler({ method: 'POST', body: { student: STUDENT, t: token(), action: 'delete', sessionId: 'sess-1', fileName: 'nd-austeja-mockute-atsakymai.pdf' }, headers: {}, query: {} } as any, ok as any);
    expect(ok.getResult().statusCode).toBe(200);
    expect(state.removed).toEqual([['sess-1/nd-austeja-mockute-atsakymai.pdf']]);
  });
});
