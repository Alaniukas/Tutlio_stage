import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOKSLO_VAISIAI_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  send: vi.fn(),
  profileUpsert: vi.fn(),
  studentUpdate: vi.fn(),
  profileError: null as { message: string } | null,
  studentError: null as { message: string } | null,
}));

vi.mock('../../api/_lib/sendMvFamilyAccountsEmail.js', () => ({
  sendMvAccountActivationEmail: mocks.send,
}));

import { provisionMvFamilyAccounts } from '../../api/_lib/mvProvisionFamilyAccounts';

function awaitedMutation(result: { error: unknown }) {
  const query: any = {
    eq: vi.fn(() => query),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return query;
}

function database() {
  return {
    auth: { admin: {
      createUser: mocks.createUser,
      deleteUser: mocks.deleteUser,
    } },
    from: vi.fn((table: string) => {
      if (table === 'students') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: {
            id: 'student-1',
            full_name: 'Child',
            email: null,
            tutor_id: 'tutor-1',
            organization_id: MOKSLO_VAISIAI_ORG_ID,
            linked_user_id: null,
            parent_user_id: null,
            payer_name: 'Parent',
            payer_email: 'parent@example.test',
          }, error: null })),
          update: vi.fn((value) => {
            mocks.studentUpdate(value);
            return awaitedMutation({ error: mocks.studentError });
          }),
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
      if (table === 'profiles') {
        return {
          upsert: vi.fn((value) => {
            mocks.profileUpsert(value);
            return Promise.resolve({ error: mocks.profileError });
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('JOIN_LINK_SECRET', 'test-secret');
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'auth-student' } }, error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.send.mockResolvedValue({ ok: true });
  mocks.profileError = null;
  mocks.studentError = null;
});

describe('Mokslo Vaisiai username provisioning', () => {
  it('creates a hidden auth alias while exposing and emailing only the student username', async () => {
    const result = await provisionMvFamilyAccounts(database(), {
      studentId: 'student-1',
      studentFullName: 'Child',
      studentEmail: '',
      parentEmail: 'parent@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.student?.email).toMatch(/^mv-[a-f0-9]{16}$/);
    expect(result.student?.notifyEmail).toBe('parent@example.test');

    const created = mocks.createUser.mock.calls[0][0];
    expect(created.email).toMatch(/^mv-[a-f0-9]{16}@student-login\.tutlio\.invalid$/);
    expect(created.user_metadata).not.toHaveProperty('student_id');
    expect(created.app_metadata).toMatchObject({
      provisioned_by_organization: MOKSLO_VAISIAI_ORG_ID,
      student_login_name: result.student?.email,
      student_contact_email: 'parent@example.test',
    });
    expect(mocks.profileUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'auth-student',
      email: null,
      organization_id: null,
    }));
    expect(mocks.studentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      linked_user_id: 'auth-student',
      email: null,
    }));
    expect(mocks.send.mock.calls[0][1]).toMatchObject({
      accountIdentifier: result.student?.email,
      accountEmail: created.email,
    });
  });

  it('removes a newly created auth user when the profile cannot be saved', async () => {
    mocks.profileError = { message: 'profile write failed' };

    const result = await provisionMvFamilyAccounts(database(), {
      studentId: 'student-1',
      studentFullName: 'Child',
      studentEmail: '',
      parentEmail: 'parent@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result).toMatchObject({
      ok: false,
      status: 500,
      code: 'student_profile_failed',
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith('auth-student');
    expect(mocks.studentUpdate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('removes a newly created auth user when the student cannot be linked', async () => {
    mocks.studentError = { message: 'student link failed' };

    const result = await provisionMvFamilyAccounts(database(), {
      studentId: 'student-1',
      studentFullName: 'Child',
      studentEmail: '',
      parentEmail: 'parent@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result).toMatchObject({
      ok: false,
      status: 500,
      code: 'link_student_failed',
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith('auth-student');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
