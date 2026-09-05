import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  student: null as Record<string, unknown> | null,
  org: null as Record<string, unknown> | null,
  sessions: [] as Array<Record<string, unknown>>,
  files: {} as Record<string, Array<{ name: string; metadata: { size: number } | null }>>,
  uploadPaths: [] as string[],
  removed: [] as string[][],
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
        if (table === 'profiles') return resolve({ data: [{ id: 't1', full_name: 'Demo Mokytoja Ana' }], error: null });
        if (table === 'school_class_groups') return resolve({ data: [{ id: 'g1', name: 'QA Legal Matematika' }], error: null });
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
  state.student = { id: STUDENT, full_name: 'Austėja Mockutė', organization_id: 'org1', detached_at: null };
  state.org = { id: 'org1', name: 'Demo Mokykla', entity_type: 'school', features: {} };
  const inFuture = new Date(Date.now() + 3 * 86_400_000).toISOString();
  state.sessions = [
    { id: 'sess-1', student_id: STUDENT, start_time: inFuture, end_time: inFuture, status: 'active', meeting_link: 'https://meet.google.com/abc', tutor_id: 't1', class_group_id: 'g1', subject_id: null, topic: null },
    { id: 'sess-2', student_id: 'other', start_time: inFuture, end_time: inFuture, status: 'active', meeting_link: 'https://meet.google.com/abc', tutor_id: 't1', class_group_id: 'g1', subject_id: null, topic: null },
  ];
  state.files = {
    'sess-2': [{ name: 'uzduotys.pdf', metadata: { size: 1200 } }],
    'sess-1': [{ name: 'nd-austeja-mockute-atsakymai.pdf', metadata: { size: 800 } }],
  };
  state.uploadPaths = [];
  state.removed = [];
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
    expect(s.files.find((f: any) => f.name === 'uzduotys.pdf').url).toBe('https://signed/sess-2/uzduotys.pdf');
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
