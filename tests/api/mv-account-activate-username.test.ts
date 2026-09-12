import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  find: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../../api/_lib/findAuthUserByEmail.js', () => ({ findAuthUserByEmail: mocks.find }));

import handler from '../../api/mv-account-activate';
import { buildMvAccountActivationToken } from '../../api/_lib/mvAccountActivationToken';
import { MOKSLO_VAISIAI_ORG_ID } from '../../src/lib/marketMoney';

const loginName = 'mv-0123456789abcdef';
const authEmail = `${loginName}@student-login.tutlio.invalid`;

function query(data: unknown) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return builder;
}

beforeEach(() => {
  vi.stubEnv('JOIN_LINK_SECRET', 'activation-secret');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  mocks.find.mockResolvedValue({ id: 'auth-student' });
  mocks.getUser.mockResolvedValue({
    data: { user: {
      id: 'auth-student',
      user_metadata: { role: 'student' },
      app_metadata: {
        student_login_name: loginName,
        student_contact_email: 'parent@example.test',
      },
    } },
    error: null,
  });
  mocks.createClient.mockReturnValue({
    from: vi.fn((table: string) => table === 'students'
      ? query({
          id: 'student-1',
          full_name: 'Child',
          organization_id: MOKSLO_VAISIAI_ORG_ID,
          parent_user_id: null,
          linked_user_id: 'auth-student',
        })
      : query({ name: 'Mokslo vaisiai', preferred_locale: 'lt' })),
    auth: { admin: { getUserById: mocks.getUser } },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('keeps the internal alias out of the activation preview and login URL', async () => {
  const token = buildMvAccountActivationToken({
    studentId: 'student-1',
    role: 'student',
    email: loginName,
  }, 'activation-secret');
  const response: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((value) => value),
  };

  const result = await handler({
    method: 'GET',
    query: { t: token },
    headers: { host: 'tutlio.lt' },
  } as any, response);

  expect(response.status).toHaveBeenCalledWith(200);
  expect(mocks.find).toHaveBeenCalledWith(expect.anything(), authEmail);
  expect(result.email).toBe(loginName);
  expect(result.loginUrl).toContain(`email=${loginName}`);
  expect(JSON.stringify(result)).not.toContain('student-login.tutlio.invalid');
});
