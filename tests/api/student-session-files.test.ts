import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'user-1',
  student: { id: 'stu-1', full_name: 'Ignas Test', linked_user_id: 'user-1' } as Record<string, unknown> | null,
  session: {
    id: 'sess-1',
    student_id: 'stu-1',
    start_time: '2026-09-07T13:00:00.000Z',
    end_time: '2026-09-07T13:45:00.000Z',
    class_group_id: 'grp-1',
  } as Record<string, unknown> | null,
  files: {
    'sess-1': [{ name: 'nd-ignas-test-homework.pdf', metadata: { size: 1000 } }],
    'sess-2': [{ name: 'teacher-material.pdf', metadata: { size: 2000 } }],
  } as Record<string, Array<{ name: string; metadata: { size: number } | null }>>,
  uploadPaths: [] as string[],
  removed: [] as string[][],
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: vi.fn(async () => ({ userId: state.userId, isInternal: false })),
}));

vi.mock('../../api/_lib/extraLessonsContractShared', () => ({
  serviceSupabase: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const api: any = {
        select: () => api,
        eq: (col: string, v: unknown) => { filters.push([col, v]); return api; },
        maybeSingle: async () => {
          if (table === 'sessions') {
            const id = filters.find(([c]) => c === 'id')?.[1];
            return { data: id === state.session?.id ? state.session : null, error: null };
          }
          if (table === 'students') {
            const id = filters.find(([c]) => c === 'id')?.[1];
            return { data: id === state.student?.id ? state.student : null, error: null };
          }
          if (table === 'parent_profiles') return { data: null, error: null };
          if (table === 'parent_students') return { data: null, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (v: any) => unknown) => {
          if (table === 'school_class_group_members') {
            return resolve({ data: [{ group_id: 'grp-1' }], error: null });
          }
          if (table === 'sessions') {
            const cg = filters.find(([c]) => c === 'class_group_id')?.[1];
            if (cg) {
              return resolve({
                data: [
                  state.session,
                  { ...state.session, id: 'sess-2', student_id: 'stu-2' },
                ],
                error: null,
              });
            }
          }
          return resolve({ data: [], error: null });
        },
      };
      return api;
    },
    storage: {
      from: () => ({
        list: async (folder: string) => ({ data: state.files[folder] || [], error: null }),
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
          error: null,
        }),
        createSignedUploadUrl: async (path: string) => {
          state.uploadPaths.push(path);
          return { data: { token: 'tok-1', path }, error: null };
        },
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { error: null };
        },
      }),
    },
  }),
}));

describe('student-session-files API', () => {
  beforeEach(() => {
    state.uploadPaths = [];
    state.removed = [];
  });

  it('lists teacher materials from sibling group folders and own homework', async () => {
    const { default: handler } = await import('../../api/student-session-files');
    const res = {
      statusCode: 200,
      body: null as unknown,
      setHeader: vi.fn(),
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { this.body = payload; return this; },
    };
    await handler(
      { method: 'POST', body: { action: 'list', sessionId: 'sess-1' }, headers: {} } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    const names = (res.body as { files: Array<{ name: string }> }).files.map((f) => f.name);
    expect(names).toContain('teacher-material.pdf');
    expect(names).toContain('nd-ignas-test-homework.pdf');
  });

  it('returns signed upload url for homework', async () => {
    const { default: handler } = await import('../../api/student-session-files');
    const res = {
      statusCode: 200,
      body: null as unknown,
      setHeader: vi.fn(),
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { this.body = payload; return this; },
    };
    await handler(
      {
        method: 'POST',
        body: { action: 'upload-url', sessionId: 'sess-1', fileName: 'Atsakymai.pdf', size: 1200 },
        headers: {},
      } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    expect(state.uploadPaths[0]).toBe('sess-1/nd-ignas-test-Atsakymai.pdf');
  });
});
