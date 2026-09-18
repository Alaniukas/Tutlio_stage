import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provision: vi.fn(),
  updateStudent: vi.fn(),
}));

vi.mock('../../api/_lib/mvProvisionFamilyAccounts.js', () => ({
  provisionMvFamilyAccounts: mocks.provision,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { createUser: vi.fn() } },
    from: (table: string) => {
      if (table !== 'students') throw new Error(`Unexpected table: ${table}`);
      const read: any = {
        select: () => read,
        eq: () => read,
        maybeSingle: async () => ({
          data: {
            id: 'student-1',
            tutor_id: 'tutor-1',
            email: 'family@example.test',
            linked_user_id: null,
            organization_id: null,
            detached_at: null,
            full_name: 'Child',
          },
          error: null,
        }),
        update: (value: unknown) => {
          mocks.updateStudent(value);
          return {
            eq: () => ({
              is: async () => ({ error: null }),
            }),
          };
        },
      };
      return read;
    },
  }),
}));

import handler from '../../api/register-student';

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  mocks.provision.mockResolvedValue({
    ok: true,
    parent: {
      email: 'family@example.test',
      userId: 'parent-user',
      created: true,
      emailSent: false,
      activationUrl: '',
      notifyEmail: 'family@example.test',
    },
    student: {
      email: 'pk-7k4m-p9qd',
      userId: 'student-user',
      created: true,
      emailSent: true,
      activationUrl: 'https://tutlio.lt/activate',
      notifyEmail: 'family@example.test',
    },
  });
});

describe('same-email parent registration', () => {
  it('creates the parent as the primary account and can request a generated child login', async () => {
    const res = response();
    await handler({
      method: 'POST',
      headers: { host: 'tutlio.lt' },
      body: {
        studentId: 'student-1',
        email: 'family@example.test',
        password: 'chosen-password',
        fullName: 'Child',
        payerType: 'parent',
        payerName: 'Parent',
        payerEmail: 'FAMILY@example.test',
        sameEmailParentMode: true,
        createStudentUsernameAccount: true,
      },
    } as any, res);

    expect(mocks.provision).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      parentEmail: 'family@example.test',
      parentPassword: 'chosen-password',
      scope: 'both',
      forceStudentUsername: true,
      suppressParentActivationEmail: true,
    }));
    expect(mocks.updateStudent).toHaveBeenCalledWith(expect.objectContaining({
      email: null,
      payment_payer: 'parent',
      payer_email: 'family@example.test',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      accountPortal: 'parent',
      studentUsernameCreated: true,
      studentUsername: 'pk-7k4m-p9qd',
    }));
  });

  it('rejects the mode unless the parent and registration emails match', async () => {
    const res = response();
    await handler({
      method: 'POST',
      headers: { host: 'tutlio.lt' },
      body: {
        studentId: 'student-1',
        email: 'family@example.test',
        password: 'chosen-password',
        payerType: 'parent',
        payerName: 'Parent',
        payerEmail: 'different@example.test',
        sameEmailParentMode: true,
      },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.provision).not.toHaveBeenCalled();
  });
});
