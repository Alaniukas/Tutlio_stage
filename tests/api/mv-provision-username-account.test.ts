import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOKSLO_VAISIAI_ORG_ID, PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  send: vi.fn(),
  profileUpsert: vi.fn(),
  studentUpdate: vi.fn(),
  generateLoginName: vi.fn(),
  profileError: null as { message: string } | null,
  studentError: null as { message: string } | null,
}));

vi.mock('../../api/_lib/sendMvFamilyAccountsEmail.js', () => ({
  sendMvAccountActivationEmail: mocks.send,
}));
vi.mock('../../api/_lib/generateStudentLoginName.js', () => ({
  generateStudentLoginName: mocks.generateLoginName,
}));

import { provisionMvFamilyAccounts } from '../../api/_lib/mvProvisionFamilyAccounts';

function awaitedMutation(result: { error: unknown }) {
  const query: any = {
    eq: vi.fn(() => query),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return query;
}

function database(
  organizationId = MOKSLO_VAISIAI_ORG_ID,
  organization?: Record<string, unknown>,
) {
  const organizationRow = organization ?? (organizationId === PRO_KLASE_ORG_ID
    ? {
        name: 'Pro Klasė',
        preferred_locale: 'lt',
        logo_url: 'https://cdn.example/proklase.png',
        brand_color: '#004ec2',
        brand_color_secondary: '#0066ff',
        features: { public_name: 'Pro Klasė' },
      }
    : { name: 'Mokslo vaisiai', preferred_locale: 'lt' });
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
            organization_id: organizationId,
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
            data: organizationRow,
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
  mocks.generateLoginName.mockReset();
  mocks.generateLoginName.mockReturnValue('mv-7k4m-p9qd');
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
    expect(result.student?.email).toMatch(/^mv-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
    expect(result.student?.notifyEmail).toBe('parent@example.test');

    const created = mocks.createUser.mock.calls[0][0];
    expect(created.email).toMatch(/^mv-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}@student-login\.tutlio\.invalid$/);
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

  it('retries the very unlikely generated username collision', async () => {
    mocks.generateLoginName
      .mockReturnValueOnce('mv-7k4m-p9qd')
      .mockReturnValueOnce('mv-abcd-jkmn');
    mocks.createUser
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'Email already registered', code: 'email_exists' } })
      .mockResolvedValueOnce({ data: { user: { id: 'auth-student' } }, error: null });

    const result = await provisionMvFamilyAccounts(database(), {
      studentId: 'student-1',
      studentFullName: 'Child',
      studentEmail: '',
      parentEmail: 'parent@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result.ok).toBe(true);
    expect(mocks.createUser).toHaveBeenCalledTimes(2);
    expect(mocks.createUser.mock.calls[0][0].email).toBe('mv-7k4m-p9qd@student-login.tutlio.invalid');
    expect(mocks.createUser.mock.calls[1][0].email).toBe('mv-abcd-jkmn@student-login.tutlio.invalid');
  });

  it('supports Pro Klasė and requests a Pro Klasė child username', async () => {
    mocks.generateLoginName.mockReturnValue('pk-7k4m-p9qd');

    const result = await provisionMvFamilyAccounts(database(PRO_KLASE_ORG_ID), {
      studentId: 'student-1',
      studentFullName: 'Child',
      studentEmail: '',
      parentEmail: 'parent@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result.ok).toBe(true);
    expect(mocks.generateLoginName).toHaveBeenCalledWith('pk');
    expect(mocks.createUser.mock.calls[0][0].email)
      .toBe('pk-7k4m-p9qd@student-login.tutlio.invalid');
    expect(mocks.send.mock.calls[0][1]).toMatchObject({
      organizationId: PRO_KLASE_ORG_ID,
      orgName: 'Pro Klasė',
      org: {
        name: 'Pro Klasė',
        logo_url: 'https://cdn.example/proklase.png',
        brand_color: '#004ec2',
        brand_color_secondary: '#0066ff',
      },
    });
  });

  it('ports the feature to another white-label without leaking an MV or Pro Klasė identity', async () => {
    const organizationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mocks.generateLoginName.mockReturnValue('st-7k4m-p9qd');

    const result = await provisionMvFamilyAccounts(database(organizationId, {
      name: 'Kita Akademija',
      preferred_locale: 'lt',
      logo_url: 'https://cdn.example/kita-akademija.png',
      brand_color: '#123456',
      brand_color_secondary: '#abcdef',
      features: {
        managed_family_accounts: true,
        custom_branding: true,
        public_name: 'Kita Akademija',
      },
    }), {
      studentId: 'student-1',
      studentFullName: 'Child',
      studentEmail: '',
      parentEmail: 'parent@example.test',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result.ok).toBe(true);
    expect(mocks.generateLoginName).toHaveBeenCalledWith('st');
    expect(result.ok && result.student?.email).toBe('st-7k4m-p9qd');
    expect(mocks.send.mock.calls[0][1]).toMatchObject({
      organizationId,
      orgName: 'Kita Akademija',
      org: {
        name: 'Kita Akademija',
        logo_url: 'https://cdn.example/kita-akademija.png',
        brand_color: '#123456',
        brand_color_secondary: '#abcdef',
      },
    });
  });

  it('rejects another organization when the portable flag is off', async () => {
    const result = await provisionMvFamilyAccounts(database(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      { name: 'Kita Akademija', preferred_locale: 'lt', features: {} },
    ), {
      studentId: 'student-1',
      scope: 'student',
      appOrigin: 'https://tutlio.lt',
    });

    expect(result).toMatchObject({ ok: false, status: 403, code: 'org_not_supported' });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
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
