import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  tables: {} as Record<string, any[]>,
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: (...args: unknown[]) => mocks.requireAccess(...args),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: any = new Proxy({}, {
        get: (_target, prop) => {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) => resolve({
              data: mocks.tables[table] || [],
              error: null,
            });
          }
          return () => chain;
        },
      });
      return chain;
    },
  }),
}));

function response() {
  const result = { statusCode: 0, body: null as any };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return res;
    }),
    send: vi.fn((body: string) => {
      result.body = JSON.parse(body);
      return res;
    }),
  };
  return { res, result };
}

describe('GET /api/proklase-student-packages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      access: { organizationId: PRO_KLASE_ORG_ID, userId: 'admin-1' },
    });
    mocks.tables = {
      profiles: [{ id: 'tutor-1' }, { id: 'tutor-2' }],
      students: [
        {
          id: 'student-1', tutor_id: 'tutor-1', organization_id: PRO_KLASE_ORG_ID,
          linked_user_id: null, email: 'child@example.com', payer_email: 'parent@example.com',
          full_name: 'Rustė Test',
        },
        {
          id: 'student-2', tutor_id: 'tutor-2', organization_id: PRO_KLASE_ORG_ID,
          linked_user_id: null, email: 'child@example.com', payer_email: 'parent@example.com',
          full_name: 'Rustė Test',
        },
      ],
      sessions: [{ student_id: 'student-1', subjects: { is_trial: true } }],
      lesson_packages: [{
        id: 'pooled-1', student_id: 'student-2', tutor_id: 'tutor-2',
        payment_status: 'pending', paid: false, active: true,
        pool_organization_id: PRO_KLASE_ORG_ID,
        pool_email_sent_at: '2026-09-16T18:53:00.000Z',
        lesson_package_items: [],
      }],
    };
  });

  it('does not flag an identity whose pooled package email was sent on another tutor row', async () => {
    const { default: handler } = await import('../../api/proklase-student-packages');
    const { res, result } = response();
    await handler({ method: 'GET', query: { summary: 'trial-followup' }, headers: {} } as any, res);
    expect(result).toEqual({ statusCode: 200, body: { studentIds: [] } });
  });

  it('returns pooled packages for the whole selected student identity', async () => {
    const { default: handler } = await import('../../api/proklase-student-packages');
    const { res, result } = response();
    await handler({ method: 'GET', query: { studentId: 'student-1' }, headers: {} } as any, res);
    expect(result.statusCode).toBe(200);
    expect(result.body.packages.map((pkg: any) => pkg.id)).toEqual(['pooled-1']);
  });

  it('rejects access to a student outside the organization result set', async () => {
    const { default: handler } = await import('../../api/proklase-student-packages');
    const { res, result } = response();
    await handler({ method: 'GET', query: { studentId: 'other-student' }, headers: {} } as any, res);
    expect(result.statusCode).toBe(404);
  });
});
