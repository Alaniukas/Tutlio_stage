import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOKSLO_VAISIAI_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  getUserById: vi.fn(),
  findAuthUserByEmail: vi.fn(),
  send: vi.fn(),
  profileUpsert: vi.fn(),
  studentUpdates: [] as Record<string, unknown>[],
  parentStudentUpsert: vi.fn(),
}));

vi.mock('../../api/_lib/findAuthUserByEmail.js', () => ({
  findAuthUserByEmail: mocks.findAuthUserByEmail,
  isAuthEmailAlreadyRegistered: (message: string) => /already registered/i.test(message || ''),
}));

vi.mock('../../api/_lib/sendMvFamilyAccountsEmail.js', () => ({
  sendMvAccountActivationEmail: mocks.send,
}));

import { provisionMvFamilyAccounts } from '../../api/_lib/mvProvisionFamilyAccounts';

type Scenario = 'parent' | 'student';

function database(scenario: Scenario) {
  let studentQueryCount = 0;
  let parentProfileQueryCount = 0;

  return {
    auth: {
      admin: {
        createUser: mocks.createUser,
        getUserById: mocks.getUserById,
        deleteUser: vi.fn(),
      },
    },
    from: vi.fn((table: string) => {
      if (table === 'students') {
        studentQueryCount += 1;
        const call = studentQueryCount;
        let operation: 'select' | 'update' = 'select';
        const query: any = {
          select: vi.fn(() => {
            operation = 'select';
            return query;
          }),
          update: vi.fn((value: Record<string, unknown>) => {
            operation = 'update';
            mocks.studentUpdates.push(value);
            return query;
          }),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          is: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: 'student-1',
              full_name: 'Child',
              email: scenario === 'student' ? 'child@example.test' : null,
              tutor_id: 'tutor-1',
              organization_id: MOKSLO_VAISIAI_ORG_ID,
              linked_user_id: null,
              parent_user_id: null,
              payer_name: 'Parent',
              payer_email: 'parent@example.test',
              detached_at: null,
            },
            error: null,
          })),
          then: (resolve: (value: unknown) => void) => {
            if (operation === 'update') return resolve({ error: null });
            // The second students query in the student scenario checks whether
            // the existing auth user is already linked elsewhere.
            if (scenario === 'student' && call === 2) return resolve({ data: [], error: null });
            return resolve({ data: [{ linked_user_id: null }], error: null });
          },
        };
        return query;
      }
      if (table === 'organizations') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: { name: 'Mokslo vaisiai', preferred_locale: 'lt' },
            error: null,
          })),
        };
        return query;
      }
      if (table === 'parent_profiles') {
        parentProfileQueryCount += 1;
        const call = parentProfileQueryCount;
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: call === 1 ? { user_id: 'existing-parent', email: 'parent@example.test' } : null,
            error: null,
          })),
          upsert: vi.fn(() => query),
          single: vi.fn(async () => ({ data: { id: 'parent-profile' }, error: null })),
        };
        return query;
      }
      if (table === 'parent_students') {
        return {
          upsert: vi.fn((value) => {
            mocks.parentStudentUpsert(value);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'profiles') {
        return {
          upsert: vi.fn((value) => {
            mocks.profileUpsert(value);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'chat_participants') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
          upsert: vi.fn(async () => ({ error: null })),
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('JOIN_LINK_SECRET', 'test-secret');
  mocks.studentUpdates.length = 0;
  mocks.createUser.mockResolvedValue({
    data: { user: null },
    error: { code: 'email_exists', message: 'User already registered' },
  });
  mocks.findAuthUserByEmail.mockResolvedValue({ id: 'existing-user' });
  mocks.send.mockResolvedValue({ ok: true });
});

describe('Mokslo Vaisiai existing account linking', () => {
  it('links an existing parent profile without changing its password', async () => {
    mocks.findAuthUserByEmail.mockResolvedValue({ id: 'existing-parent' });
    mocks.getUserById.mockResolvedValue({
      data: { user: { id: 'existing-parent', user_metadata: { role: 'parent' }, app_metadata: {} } },
      error: null,
    });

    const result = await provisionMvFamilyAccounts(database('parent'), {
      studentId: 'student-1',
      scope: 'parent',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result).toMatchObject({
      ok: true,
      parent: {
        userId: 'existing-parent',
        created: false,
        reused: true,
        emailSent: false,
      },
    });
    expect(mocks.parentStudentUpsert).toHaveBeenCalledWith({
      parent_id: 'parent-profile',
      student_id: 'student-1',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('links the student row to its already-registered student auth account', async () => {
    mocks.findAuthUserByEmail.mockResolvedValue({ id: 'existing-student' });
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'existing-student',
          user_metadata: { role: 'student', student_id: 'student-1' },
          app_metadata: { provisioned_by_organization: MOKSLO_VAISIAI_ORG_ID },
        },
      },
      error: null,
    });

    const result = await provisionMvFamilyAccounts(database('student'), {
      studentId: 'student-1',
      studentEmail: 'child@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result).toMatchObject({
      ok: true,
      student: {
        email: 'child@example.test',
        userId: 'existing-student',
        created: false,
        reused: true,
        emailSent: false,
      },
    });
    expect(mocks.profileUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'existing-student',
      email: 'child@example.test',
    }));
    expect(mocks.studentUpdates).toContainEqual(expect.objectContaining({
      linked_user_id: 'existing-student',
    }));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses to attach an existing account with the wrong role', async () => {
    mocks.findAuthUserByEmail.mockResolvedValue({ id: 'wrong-role' });
    mocks.getUserById.mockResolvedValue({
      data: { user: { id: 'wrong-role', user_metadata: { role: 'tutor' }, app_metadata: {} } },
      error: null,
    });

    const result = await provisionMvFamilyAccounts(database('student'), {
      studentId: 'student-1',
      studentEmail: 'child@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: 'existing_student_account_conflict',
    });
    expect(mocks.studentUpdates).toHaveLength(0);
  });
});
