import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provision: vi.fn(),
  updateStudent: vi.fn(),
  updateFilter: vi.fn(),
  rowEmail: 'family@example.test' as string | null,
  savedRows: [{ id: 'student-1' }] as Array<{ id: string }>,
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
            email: mocks.rowEmail,
            linked_user_id: null,
            organization_id: null,
            detached_at: null,
            full_name: 'Child',
          },
          error: null,
        }),
        update: (value: unknown) => {
          mocks.updateStudent(value);
          const query: any = {
            eq: () => query, is: () => query,
            or: (filter: string) => { mocks.updateFilter(filter); return query; },
            select: async () => ({ data: mocks.savedRows, error: null }),
            then: (resolve: any) => resolve({ error: null }),
          };
          return query;
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
  mocks.rowEmail = 'family@example.test';
  mocks.savedRows = [{ id: 'student-1' }];
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
  it.each([true, false])('completes a shared login from an initially blank student email (save succeeds: %s)', async (saved) => {
    mocks.rowEmail = null;
    mocks.savedRows = saved ? [{ id: 'student-1' }] : [];
    mocks.provision.mockResolvedValue({ ok: true, parent: {
      email: 'family@example.test', userId: 'parent-user', created: true,
      emailSent: false, activationUrl: '', notifyEmail: 'family@example.test',
    } });
    const res = response();
    await handler({ method: 'POST', headers: { host: 'tutlio.lt' }, body: {
      studentId: 'student-1', email: 'family@example.test', password: 'chosen-password',
      fullName: 'Child', payerType: 'parent', payerName: 'Parent', payerEmail: 'family@example.test',
      sameEmailParentMode: true, createStudentUsernameAccount: false,
    } } as any, res);
    expect(mocks.updateStudent).toHaveBeenCalledWith(expect.objectContaining({
      email: 'family@example.test', linked_user_id: 'parent-user',
    }));
    expect(mocks.updateFilter).toHaveBeenCalledWith('linked_user_id.is.null,linked_user_id.eq.parent-user');
    expect(res.status).toHaveBeenCalledWith(saved ? 200 : 500);
    if (saved) expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accountPortal: 'parent' }));
    else expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

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
