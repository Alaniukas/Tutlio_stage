import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), findUser: vi.fn(),
  org: { id: 'org-1', entity_type: 'school', features: { school_lesson_recordings: true } },
  students: [] as Record<string, unknown>[], parents: [] as Record<string, unknown>[], links: [] as Record<string, unknown>[],
  denials: [] as Record<string, unknown>[], error: null as { code: string; message: string } | null,
  upserts: [] as Record<string, unknown>[], deletes: [] as Record<string, unknown>[],
}));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: mocks.admin }));
vi.mock('../../api/_lib/findAuthUserByEmail.js', () => ({ findAuthUserByEmail: mocks.findUser }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({
  serviceSupabase: () => ({
    from(table: string) {
      const eqs: Record<string, unknown> = {};
      const ins: Record<string, unknown[]> = {};
      let emailColumn = '';
      let emailPattern = '';
      let mutation: 'delete' | 'upsert' | null = null;
      let payload: Record<string, unknown> = {};
      const result = () => {
        if (table === 'organizations') return { data: mocks.org, error: null };
        if (table === 'students') {
          return { data: mocks.students.filter((row) => {
            if (emailColumn) return String(row[emailColumn] || '').toLowerCase() === emailPattern.replace(/\\([\\%_])/g, '$1');
            return Object.entries(ins).every(([column, values]) => values.includes(row[column]));
          }).slice(0, 1000), error: null };
        }
        if (table === 'parent_profiles') return { data: mocks.parents, error: null };
        if (table === 'parent_students') return { data: mocks.links, error: null };
        if (mutation === 'upsert') {
          mocks.upserts.push(payload);
          return { data: { id: 'denial-1', ...payload }, error: mocks.error };
        }
        if (mutation === 'delete') {
          mocks.deletes.push(eqs);
          return { data: mocks.denials.filter((row) => row.id === eqs.id && row.organization_id === eqs.organization_id), error: mocks.error };
        }
        return { data: mocks.denials.filter((row) => row.organization_id === eqs.organization_id), error: mocks.error };
      };
      const query: any = {
        select: () => query, order: () => query, limit: () => query,
        ilike: (column: string, pattern: string) => { emailColumn = column; emailPattern = pattern; return query; },
        in: (column: string, values: unknown[]) => { ins[column] = values; return query; },
        eq: (key: string, value: unknown) => { eqs[key] = value; return query; },
        upsert: (value: Record<string, unknown>) => { mutation = 'upsert'; payload = value; return query; },
        delete: () => { mutation = 'delete'; return query; },
        maybeSingle: async () => result(), single: async () => result(),
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };
      return query;
    },
  }),
}));
import handler from '../../api/school-recording-access';

function response() {
  const result = { statusCode: 0, body: null as any };
  const res: any = {
    setHeader: vi.fn(),
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; },
    result,
  };
  return res;
}

describe('school recording access management', () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ userId: 'admin-user', isInternal: false });
    mocks.admin.mockReset().mockResolvedValue({ organizationId: 'org-1', role: 'owner', permissions: {} });
    mocks.findUser.mockReset().mockResolvedValue({ id: 'parent-user' });
    mocks.org = { id: 'org-1', entity_type: 'school', features: { school_lesson_recordings: true } };
    mocks.students = [{ id: 'child-a', payer_email: 'Parent@school.lt' }];
    mocks.parents = []; mocks.links = []; mocks.denials = []; mocks.upserts = []; mocks.deletes = []; mocks.error = null;
  });

  it('requires both recordings view and sessions edit permission', async () => {
    mocks.admin.mockResolvedValue({ organizationId: 'org-1', role: 'custom', permissions: { 'recordings.view': true } });
    const res = response();
    await handler({ method: 'POST', body: { action: 'revoke', email: 'parent@school.lt' }, headers: {} } as any, res);
    expect(res.result.statusCode).toBe(403);
    expect(mocks.upserts).toEqual([]);
  });

  it('normalizes the email and retains the linked Auth identity without modifying account or billing data', async () => {
    const res = response();
    await handler({ method: 'POST', body: JSON.stringify({ action: 'revoke', email: ' PARENT@School.LT ' }), headers: {} } as any, res);
    expect(res.result.statusCode).toBe(200);
    expect(mocks.upserts).toEqual([expect.objectContaining({ organization_id: 'org-1', email: 'parent@school.lt', user_id: 'parent-user' })]);
    expect(mocks.students[0].payer_email).toBe('Parent@school.lt');
    expect(mocks.findUser).toHaveBeenCalledWith(expect.anything(), 'parent@school.lt');
  });

  it('allows a linked parent whose email is not a payment contact', async () => {
    mocks.students = [{ id: 'child-a' }];
    mocks.parents = [{ id: 'parent-profile', user_id: 'parent-user', email: 'parent@school.lt' }];
    mocks.links = [{ student_id: 'child-a' }];
    const res = response();
    await handler({ method: 'POST', body: { action: 'revoke', email: 'parent@school.lt' }, headers: {} } as any, res);
    expect(res.result.statusCode).toBe(200);
  });

  it('finds a payment contact beyond the first 1000 school students', async () => {
    mocks.students = [
      ...Array.from({ length: 1200 }, (_, index) => ({ id: `child-${index}`, payer_email: `other-${index}@school.lt` })),
      { id: 'child-last', payer_email: 'parent@school.lt' },
    ];
    const res = response();
    await handler({ method: 'POST', body: { action: 'revoke', email: 'parent@school.lt' }, headers: {} } as any, res);
    expect(res.result.statusCode).toBe(200);
    expect(mocks.upserts).toHaveLength(1);
  });

  it('rejects a person who has no child in the current school', async () => {
    mocks.students = [{ id: 'child-a', payer_email: 'different@school.lt' }];
    const res = response();
    await handler({ method: 'POST', body: { action: 'revoke', email: 'parent@school.lt' }, headers: {} } as any, res);
    expect(res.result.statusCode).toBe(404);
    expect(res.result.body.error).toBe('recording_access_person_not_in_school');
    expect(mocks.upserts).toEqual([]);
  });

  it('never accepts a different organization supplied by the browser', async () => {
    const res = response();
    await handler({ method: 'POST', body: { action: 'revoke', email: 'parent@school.lt', organizationId: 'org-other' }, headers: {} } as any, res);
    expect(res.result.statusCode).toBe(403);
    expect(mocks.upserts).toEqual([]);
  });

  it('restores only a denial in the administrator’s organization', async () => {
    mocks.denials = [{ id: 'other-denial', organization_id: 'org-other' }, { id: 'own-denial', organization_id: 'org-1' }];
    const other = response();
    await handler({ method: 'POST', body: { action: 'restore', denialId: 'other-denial' }, headers: {} } as any, other);
    expect(other.result.statusCode).toBe(404);
    const own = response();
    await handler({ method: 'POST', body: { action: 'restore', denialId: 'own-denial' }, headers: {} } as any, own);
    expect(own.result.statusCode).toBe(200);
    expect(mocks.deletes).toEqual([{ organization_id: 'org-1', id: 'other-denial' }, { organization_id: 'org-1', id: 'own-denial' }]);
  });

  it('lists only the administrator’s school denials and reports missing migration', async () => {
    mocks.denials = [{ id: 'a', organization_id: 'org-1' }, { id: 'b', organization_id: 'org-other' }];
    const res = response();
    await handler({ method: 'GET', headers: {} } as any, res);
    expect(res.result.body.denials.map((row: any) => row.id)).toEqual(['a']);
    mocks.error = { code: 'PGRST205', message: 'table missing' };
    const missing = response();
    await handler({ method: 'GET', headers: {} } as any, missing);
    expect(missing.result).toMatchObject({ statusCode: 503, body: { setupRequired: true } });
  });
});
