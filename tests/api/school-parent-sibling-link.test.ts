import { beforeEach, describe, expect, it, vi } from 'vitest';

const LAISVI_ORG = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  bindGuardian: vi.fn(),
  findAuth: vi.fn(),
}));

vi.mock('../../api/_lib/schoolFamilyAccounts.js', () => ({
  bindSchoolFamilyGuardianForRegisteredParent: mocks.bindGuardian,
}));
vi.mock('../../api/_lib/findAuthUserByEmail.js', () => ({
  findAuthUserByEmail: mocks.findAuth,
}));

import {
  linkExistingSchoolParentByEmail,
  listActiveSchoolStudentsByPayerEmail,
  payerEmailMatches,
} from '../../api/_lib/schoolParentSiblingLink';

describe('schoolParentSiblingLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bindGuardian.mockResolvedValue({ bound: true });
  });

  it('matches payer and secondary parent emails', () => {
    expect(payerEmailMatches({ payer_email: 'a@b.lt', parent_secondary_email: null }, 'a@b.lt')).toBe(true);
    expect(payerEmailMatches({ payer_email: 'x@b.lt', parent_secondary_email: 'a@b.lt' }, 'a@b.lt')).toBe(true);
    expect(payerEmailMatches({ payer_email: 'x@b.lt', parent_secondary_email: null }, 'a@b.lt')).toBe(false);
  });

  it('lists all active school children for the same payer email', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'students') throw new Error(`unexpected table ${table}`);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        or: () => chain,
        then: (resolve: (value: unknown) => unknown) => resolve({
          data: [
            { id: 'child-1', parent_user_id: null, payer_email: 'parent@example.com', parent_secondary_email: null },
            { id: 'child-2', parent_user_id: null, payer_email: 'parent@example.com', parent_secondary_email: null },
          ],
          error: null,
        }),
      };
      return chain;
    });

    const rows = await listActiveSchoolStudentsByPayerEmail({ from: mocks.from } as any, LAISVI_ORG, 'parent@example.com');
    expect(rows.map((row) => row.id)).toEqual(['child-1', 'child-2']);
  });

  it('links an existing school parent to every payer sibling and binds guardians', async () => {
    mocks.findAuth.mockResolvedValue({ id: 'parent-user' });
    mocks.from.mockImplementation((table: string) => {
      const filters: Record<string, unknown> = {};
      let action = 'select';
      const chain: any = {
        select: () => chain,
        eq: (...args: unknown[]) => { filters[args[0] as string] = args[1]; return chain; },
        in: (...args: unknown[]) => { filters[args[0] as string] = args[1]; return chain; },
        is: () => chain,
        or: () => chain,
        upsert: () => chain,
        update: () => chain,
        maybeSingle: async () => {
          if (table === 'parent_profiles') return { data: { id: 'pp-1', user_id: 'parent-user', email: 'parent@example.com' }, error: null };
          if (table === 'students' && filters.id === 'child-1') {
            return {
              data: {
                id: 'child-1',
                organization_id: LAISVI_ORG,
                tutor_id: null,
                detached_at: null,
                enrollment_status: 'active',
              },
              error: null,
            };
          }
          if (table === 'organizations') {
            return {
              data: {
                entity_type: 'school',
                features: { school_family_portal: true },
              },
              error: null,
            };
          }
          if (table === 'students' && filters.id === 'child-2') return { data: { linked_user_id: null }, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (table === 'students' && !filters.id) {
            return resolve({
              data: [
                { id: 'child-1', parent_user_id: null, payer_email: 'parent@example.com', parent_secondary_email: null },
                { id: 'child-2', parent_user_id: null, payer_email: 'parent@example.com', parent_secondary_email: null },
              ],
              error: null,
            });
          }
          if (table === 'parent_invites') return resolve({ data: [{ id: 'invite-2', student_id: 'child-2', parent_email: 'parent@example.com' }], error: null });
          if (action === 'upsert' || action === 'update') return resolve({ data: null, error: null });
          return resolve({ data: null, error: null });
        },
      };
      chain.upsert = () => { action = 'upsert'; return chain; };
      chain.update = () => { action = 'update'; return chain; };
      return chain;
    });

    const result = await linkExistingSchoolParentByEmail({ from: mocks.from } as any, 'child-1', 'parent@example.com');
    expect(result).toEqual({ linked: true, studentIds: ['child-1', 'child-2'] });
    expect(mocks.bindGuardian).toHaveBeenCalledTimes(2);
  });
});
