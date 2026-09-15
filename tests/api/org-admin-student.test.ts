import { describe, expect, it } from 'vitest';
import { resolveLiveOrgStudent } from '../../api/_lib/orgAdminStudent';

function fakeDb(args: {
  student?: Record<string, unknown> | null;
  tutor?: Record<string, unknown> | null;
  updateError?: string | null;
}) {
  const updates: unknown[] = [];
  const db = {
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        update: (payload: unknown) => {
          updates.push(payload);
          return query;
        },
        maybeSingle: async () => table === 'students'
          ? { data: args.student ?? null, error: null }
          : { data: args.tutor ?? null, error: null },
        then: (resolve: any) => Promise.resolve({
          data: null,
          error: args.updateError ? { message: args.updateError } : null,
        }).then(resolve),
      };
      return query;
    },
  };
  return { db: db as any, updates };
}

describe('resolveLiveOrgStudent', () => {
  it('heals a live org-tutor client whose organization_id was never stamped', async () => {
    const { db, updates } = fakeDb({
      student: { id: 'adomas', tutor_id: 'rimantas', organization_id: null, detached_at: null },
      tutor: { organization_id: 'org' },
    });
    await expect(resolveLiveOrgStudent(db, 'adomas', 'org')).resolves.toEqual({
      id: 'adomas',
      tutor_id: 'rimantas',
    });
    expect(updates).toEqual([{ organization_id: 'org' }]);
  });

  it('does not rewrite a student who already belongs to the organization', async () => {
    const { db, updates } = fakeDb({
      student: { id: 'student', tutor_id: 'tutor', organization_id: 'org', detached_at: null },
      tutor: { organization_id: 'org' },
    });
    await expect(resolveLiveOrgStudent(db, 'student', 'org')).resolves.toEqual({
      id: 'student',
      tutor_id: 'tutor',
    });
    expect(updates).toEqual([]);
  });

  it('rejects clients from another organization even if they have a tutor', async () => {
    const { db, updates } = fakeDb({
      student: { id: 'student', tutor_id: 'tutor', organization_id: 'other', detached_at: null },
      tutor: { organization_id: 'other' },
    });
    await expect(resolveLiveOrgStudent(db, 'student', 'org')).resolves.toBeNull();
    expect(updates).toEqual([]);
  });
});
