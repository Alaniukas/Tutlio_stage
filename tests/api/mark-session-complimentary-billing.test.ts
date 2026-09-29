import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  paymentModel: null as string | null,
  patch: null as Record<string, unknown> | null,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        update(patch: Record<string, unknown>) { state.patch = patch; return query; },
        maybeSingle: async () => ({
          data: table === 'sessions'
            ? { id: 'lesson-1', tutor_id: 'tutor-1', student_id: 'student-1', status: 'active', is_complimentary: true, lesson_package_id: null }
            : table === 'profiles'
              ? { organization_id: 'org-1', enable_per_lesson: true, enable_monthly_billing: false }
              : table === 'students'
                ? { payment_model: state.paymentModel }
                : null,
          error: null,
        }),
        single: async () => ({
          data: table === 'organizations'
            ? { enable_per_lesson: false, enable_monthly_billing: true }
            : { id: 'lesson-1', ...(state.patch ?? {}) },
          error: null,
        }),
      };
      return query;
    },
  }),
}));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => ({ userId: 'admin-1' }) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: async () => ({ organizationId: 'org-1', role: 'owner', permissions: {} }),
}));
vi.mock('../../src/lib/orgAdminPermissions.js', () => ({ hasOrgAdminPermission: () => true }));
vi.mock('../../api/_lib/sessionStatusConfirmation.js', () => ({ returnPackageCounterToAvailable: async () => {} }));
vi.mock('../../api/_lib/supabaseServiceRoleClientOptions.js', () => ({ supabaseServiceRoleClientOptions: () => ({}) }));

import handler from '../../api/mark-session-complimentary';

function response() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  };
  return res;
}

describe('undo complimentary org lesson', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    state.paymentModel = null;
    state.patch = null;
  });

  it('restores confirmed for the monthly billing owner', async () => {
    const res = response();
    await handler({ method: 'POST', body: { sessionId: 'lesson-1', complimentary: false } } as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(state.patch).toMatchObject({ paid: false, payment_status: 'confirmed' });
  });

  it('retains pending for an explicitly per-lesson student', async () => {
    state.paymentModel = 'per_lesson';
    const res = response();
    await handler({ method: 'POST', body: { sessionId: 'lesson-1', complimentary: false } } as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(state.patch).toMatchObject({ paid: false, payment_status: 'pending' });
  });
});
