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
import { MOKSLO_VAISIAI_ORG_ID, PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

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

it('returns Pro Klasė branding and keeps the follow-up login white-label', async () => {
  const proLoginName = 'pk-0123456789abcdef';
  mocks.createClient.mockReturnValue({
    from: vi.fn((table: string) => table === 'students'
      ? query({
          id: 'student-1',
          full_name: 'Child',
          organization_id: PRO_KLASE_ORG_ID,
          parent_user_id: null,
          linked_user_id: 'auth-student',
        })
      : query({
          name: 'Pro Klasė',
          slug: 'proklase',
          preferred_locale: 'lt',
          logo_url: 'https://cdn.example/proklase.png',
          brand_color: '#004ec2',
          brand_color_secondary: '#0066ff',
          features: { public_name: 'Pro Klasė' },
        })),
    auth: { admin: { getUserById: mocks.getUser } },
  });

  const token = buildMvAccountActivationToken({
    studentId: 'student-1',
    role: 'student',
    email: proLoginName,
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
  expect(result).toMatchObject({
    orgName: 'Pro Klasė',
    branding: {
      name: 'Pro Klasė',
      logoUrl: 'https://cdn.example/proklase.png',
      brandColor: '#004ec2',
      brandColorSecondary: '#0066ff',
    },
  });
  expect(result.loginUrl).toContain('org=proklase');
  expect(JSON.stringify(result)).not.toContain('Mokslo vais');
});

it('activates a flagged portable feature with the target organization branding', async () => {
  const portableLoginName = 'st-2345-abcd';
  mocks.createClient.mockReturnValue({
    from: vi.fn((table: string) => table === 'students'
      ? query({
          id: 'student-1',
          full_name: 'Child',
          organization_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          parent_user_id: null,
          linked_user_id: 'auth-student',
        })
      : query({
          name: 'Kita Akademija',
          slug: 'kita-akademija',
          preferred_locale: 'lt',
          logo_url: 'https://cdn.example/kita-akademija.png',
          brand_color: '#123456',
          brand_color_secondary: '#abcdef',
          features: {
            managed_family_accounts: true,
            custom_branding: true,
            public_name: 'Kita Akademija',
          },
        })),
    auth: { admin: { getUserById: mocks.getUser } },
  });

  const token = buildMvAccountActivationToken({
    studentId: 'student-1',
    role: 'student',
    email: portableLoginName,
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
  expect(result).toMatchObject({
    orgName: 'Kita Akademija',
    branding: {
      name: 'Kita Akademija',
      logoUrl: 'https://cdn.example/kita-akademija.png',
      brandColor: '#123456',
      brandColorSecondary: '#abcdef',
    },
  });
  expect(result.loginUrl).toContain('org=kita-akademija');
  expect(JSON.stringify(result)).not.toContain('Mokslo vais');
  expect(JSON.stringify(result)).not.toContain('Pro Klas');
});
