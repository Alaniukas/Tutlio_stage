import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  tables: {} as Record<string, any[]>,
  from: vi.fn(),
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: (...args: unknown[]) => mocks.requireAccess(...args),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mocks.from,
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
      access: { organizationId: PRO_KLASE_ORG_ID, userId: 'admin-1', role: 'owner', permissions: {} },
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
    mocks.from.mockImplementation((table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let slice: [number, number] | null = null;
      const chain: any = new Proxy({}, {
        get: (_target, prop) => {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) => {
              let data = (mocks.tables[table] || []).filter(row => filters.every(filter => filter(row)));
              if (slice) data = data.slice(slice[0], slice[1] + 1);
              return resolve({ data, error: null });
            };
          }
          return (key: any, value: any) => {
            if (table === 'lesson_packages') {
              if (prop === 'eq') filters.push(row => row[key] === value);
              if (prop === 'in') filters.push(row => value.includes(row[key]));
              if (prop === 'gte') filters.push(row => row[key] >= value);
              if (prop === 'lte') filters.push(row => row[key] <= value);
              if (prop === 'range') slice = [key, value];
            }
            return chain;
          };
        },
      });
      return chain;
    });
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

  it('keeps the actual unpaid extras invoice visible after a duplicate monthly offer is cancelled', async () => {
    mocks.tables.lesson_packages = [
      { id: 'duplicate-offer', student_id: 'student-1', tutor_id: 'tutor-1',
        pool_organization_id: PRO_KLASE_ORG_ID, payment_status: 'cancelled', paid: false, active: false },
      { id: 'september-extras', student_id: 'student-1', tutor_id: 'tutor-1',
        pool_organization_id: null, extras_period_start: '2026-09-01',
        payment_status: 'pending', paid: false, active: false, total_price: 93 },
      { id: 'october-paid', student_id: 'student-1', tutor_id: 'tutor-1',
        pool_organization_id: PRO_KLASE_ORG_ID, payment_status: 'paid', paid: true, active: true },
      { id: 'old-settled-extras', student_id: 'student-1', tutor_id: 'tutor-1',
        extras_period_start: '2026-08-01', payment_status: 'paid', paid: true, active: false },
    ];
    const { default: handler } = await import('../../api/proklase-student-packages');
    const { res, result } = response();
    await handler({ method: 'GET', query: { studentId: 'student-1' }, headers: {} } as any, res);
    expect(result.statusCode).toBe(200);
    expect(result.body.packages.map((pkg: any) => pkg.id)).toEqual(['september-extras', 'october-paid']);
    expect(result.body.packages[0]).toMatchObject({ total_price: 93, paid: false, payment_status: 'pending' });
  });

  it('rejects access to a student outside the organization result set', async () => {
    const { default: handler } = await import('../../api/proklase-student-packages');
    const { res, result } = response();
    await handler({ method: 'GET', query: { studentId: 'other-student' }, headers: {} } as any, res);
    expect(result.statusCode).toBe(404);
  });

  it('returns only this organization’s paid pooled base totals and reads every page', async () => {
    const { default: handler } = await import('../../api/proklase-student-packages');
    mocks.tables.lesson_packages = [
      ...Array.from({ length: 1000 }, (_, index) => ({
        id: `pool-${index}`, tutor_id: 'tutor-1', total_price: 1.25,
        pool_organization_id: PRO_KLASE_ORG_ID, paid: true, paid_at: '2026-09-15T00:00:00.000Z',
        lesson_package_items: [{ total_price: 1.25, subjects: { tutor_id: 'tutor-1' } }],
      })),
      { id: 'last-page', tutor_id: 'tutor-2', total_price: 249, pool_organization_id: PRO_KLASE_ORG_ID,
        paid: true, paid_at: '2026-09-16T00:00:00.000Z', lesson_package_items: [
          { total_price: 124, subjects: { tutor_id: 'tutor-1' } },
          { total_price: 125, subjects: { tutor_id: 'tutor-2' } },
        ] },
      { id: 'foreign', tutor_id: 'tutor-1', total_price: 999, pool_organization_id: 'another-org',
        paid: true, paid_at: '2026-09-16T00:00:00.000Z' },
      { id: 'pending', tutor_id: 'tutor-1', total_price: 999, pool_organization_id: PRO_KLASE_ORG_ID,
        paid: false, paid_at: '2026-09-16T00:00:00.000Z' },
      { id: 'later', tutor_id: 'tutor-1', total_price: 999, pool_organization_id: PRO_KLASE_ORG_ID,
        paid: true, paid_at: '2026-10-01T00:00:00.000Z' },
    ];
    const { res, result } = response();
    await handler({ method: 'GET', query: { summary: 'finance', start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-30T23:59:59.999Z' }, headers: {} } as any, res);
    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'stats.view');
    expect(result).toEqual({ statusCode: 200, body: { totalsByTutor: { 'tutor-1': 1374, 'tutor-2': 125 } } });
  });

  it('rejects a pooled package whose subject items do not reconcile to its sale total', async () => {
    const { default: handler } = await import('../../api/proklase-student-packages');
    mocks.tables.lesson_packages = [{ id: 'broken', total_price: 249, pool_organization_id: PRO_KLASE_ORG_ID,
      paid: true, paid_at: '2026-09-16T00:00:00.000Z', lesson_package_items: [
        { total_price: 124, subjects: { tutor_id: 'tutor-1' } },
        { total_price: 124, subjects: { tutor_id: 'tutor-2' } },
      ] }];
    const { res, result } = response();
    await handler({ method: 'GET', query: { summary: 'finance', start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-30T23:59:59.999Z' }, headers: {} } as any, res);
    expect(result.statusCode).toBe(500);
    expect(result.body.totalsByTutor).toBeUndefined();
  });

  it('requires finance totals permission before querying pooled finance rows', async () => {
    const { default: handler } = await import('../../api/proklase-student-packages');
    mocks.requireAccess.mockResolvedValue({ ok: true, access: { organizationId: PRO_KLASE_ORG_ID,
      userId: 'stats-only', role: 'custom', permissions: { 'stats.view': true } } });
    const { res, result } = response();
    await handler({ method: 'GET', query: { summary: 'finance', start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-30T23:59:59.999Z' }, headers: {} } as any, res);
    expect(result.statusCode).toBe(403);
    expect(mocks.from).not.toHaveBeenCalledWith('lesson_packages');
  });
});
