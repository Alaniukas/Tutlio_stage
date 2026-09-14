import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOKSLO_VAISIAI_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyAuth: vi.fn(),
  getAdminAccess: vi.fn(),
  hasPermission: vi.fn(),
  findAuthUser: vi.fn(),
  getAuthUser: vi.fn(),
  updateAuthUser: vi.fn(),
  updates: [] as Array<{ table: string; value: Record<string, unknown> }>,
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.verifyAuth }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: mocks.getAdminAccess }));
vi.mock('../../src/lib/orgAdminPermissions.js', () => ({ hasOrgAdminPermission: mocks.hasPermission }));
vi.mock('../../api/_lib/findAuthUserByEmail.js', () => ({ findAuthUserByEmail: mocks.findAuthUser }));

import handler from '../../api/admin-update-student-email';

type Scenario = {
  studentEmail: string | null;
  authEmail: string;
  appMetadata: Record<string, unknown>;
  profileEmail?: string | null;
};

function database(scenario: Scenario) {
  return {
    auth: {
      admin: {
        getUserById: mocks.getAuthUser,
        updateUserById: mocks.updateAuthUser,
      },
    },
    from: vi.fn((table: string) => {
      let selected = '';
      const query: any = {
        select: vi.fn((columns: string) => {
          selected = columns;
          return query;
        }),
        update: vi.fn((value: Record<string, unknown>) => {
          mocks.updates.push({ table, value });
          return query;
        }),
        eq: vi.fn(() => query),
        neq: vi.fn(() => query),
        ilike: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          if (table === 'students' && selected.includes('organization_id')) {
            return {
              data: {
                id: 'student-1',
                email: scenario.studentEmail,
                organization_id: MOKSLO_VAISIAI_ORG_ID,
                linked_user_id: 'student-user',
              },
              error: null,
            };
          }
          if (table === 'profiles' && selected === 'email') {
            return { data: { email: scenario.profileEmail ?? scenario.studentEmail }, error: null };
          }
          return { data: null, error: null };
        }),
        then: (
          resolve: (value: { error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve({ error: null }).then(resolve, reject),
      };
      return query;
    }),
  } as any;
}

function response() {
  const state: { statusCode: number; body: Record<string, unknown> | null } = {
    statusCode: 200,
    body: null,
  };
  const res: any = {
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: vi.fn((body: Record<string, unknown>) => {
      state.body = body;
      return body;
    }),
  };
  return { res, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates.length = 0;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  mocks.verifyAuth.mockResolvedValue({ userId: 'admin-user', isInternal: false });
  mocks.getAdminAccess.mockResolvedValue({
    organizationId: MOKSLO_VAISIAI_ORG_ID,
    role: 'owner',
    permissions: {},
  });
  mocks.hasPermission.mockReturnValue(true);
  mocks.findAuthUser.mockResolvedValue(null);
  mocks.updateAuthUser.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('admin-update-student-email', () => {
  it('keeps a managed username stable and stores the new address as contact email', async () => {
    const loginName = 'mv-7k4m-p9qd';
    const scenario = {
      studentEmail: null,
      authEmail: `${loginName}@student-login.tutlio.invalid`,
      appMetadata: {
        provisioned_by_organization: MOKSLO_VAISIAI_ORG_ID,
        student_login_name: loginName,
        student_contact_email: 'parent@example.test',
      },
    };
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: 'student-user', email: scenario.authEmail, app_metadata: scenario.appMetadata } },
      error: null,
    });
    mocks.createClient.mockReturnValue(database(scenario));
    const { res, state } = response();

    await handler({ method: 'POST', body: { studentId: 'student-1', email: 'child@example.test' } } as any, res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({
      success: true,
      email: 'child@example.test',
      loginIdentifier: loginName,
      loginChanged: false,
    });
    expect(mocks.updateAuthUser).toHaveBeenCalledWith('student-user', {
      app_metadata: expect.objectContaining({
        student_login_name: loginName,
        student_contact_email: 'child@example.test',
      }),
    });
    expect(mocks.updateAuthUser.mock.calls[0][1]).not.toHaveProperty('email');
    expect(mocks.updates).toContainEqual({ table: 'profiles', value: { email: 'child@example.test' } });
    expect(mocks.updates).toContainEqual({ table: 'students', value: { email: 'child@example.test' } });
  });

  it('moves an ordinary account to the new login email and clears retired username metadata', async () => {
    const scenario = {
      studentEmail: 'old@example.test',
      authEmail: 'old@example.test',
      appMetadata: {
        provisioned_by_organization: MOKSLO_VAISIAI_ORG_ID,
        student_login_name: 'mv-0123456789abcdef',
        student_contact_email: 'parent@example.test',
      },
    };
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: 'student-user', email: scenario.authEmail, app_metadata: scenario.appMetadata } },
      error: null,
    });
    mocks.createClient.mockReturnValue(database(scenario));
    const { res, state } = response();

    await handler({ method: 'POST', body: { studentId: 'student-1', email: 'new@example.test' } } as any, res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({
      success: true,
      loginIdentifier: 'new@example.test',
      loginChanged: true,
    });
    expect(mocks.updateAuthUser).toHaveBeenCalledWith('student-user', {
      email: 'new@example.test',
      email_confirm: true,
      app_metadata: {
        provisioned_by_organization: MOKSLO_VAISIAI_ORG_ID,
        student_login_name: null,
        student_contact_email: null,
      },
    });
  });

  it('repairs a stale contact email without changing a managed login', async () => {
    const loginName = 'mv-7k4m-p9qd';
    const scenario = {
      studentEmail: 'child@example.test',
      authEmail: `${loginName}@student-login.tutlio.invalid`,
      appMetadata: {
        provisioned_by_organization: MOKSLO_VAISIAI_ORG_ID,
        student_login_name: loginName,
        student_contact_email: 'old-parent@example.test',
      },
    };
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: 'student-user', email: scenario.authEmail, app_metadata: scenario.appMetadata } },
      error: null,
    });
    mocks.createClient.mockReturnValue(database(scenario));
    const { res, state } = response();

    await handler({ method: 'POST', body: { studentId: 'student-1', email: 'child@example.test' } } as any, res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({
      success: true,
      unchanged: true,
      metadataRepaired: true,
      loginIdentifier: loginName,
    });
    expect(mocks.updateAuthUser).toHaveBeenCalledWith('student-user', {
      app_metadata: expect.objectContaining({ student_contact_email: 'child@example.test' }),
    });
    expect(mocks.updates).toHaveLength(0);
  });
});
