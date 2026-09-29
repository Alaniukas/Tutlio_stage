import { beforeEach, describe, expect, it, vi } from 'vitest';

const MANO_ID = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  filters: [] as Array<[string, string, unknown]>,
  tutorOrgId: 'org-1',
  selectedSessions: [] as Array<Record<string, unknown>>,
  unresolvedRows: [] as Array<Record<string, unknown>>,
  unresolvedError: null as { message: string } | null,
  billingFlags: { enable_per_lesson: false, enable_monthly_billing: true },
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('stripe', () => ({ default: class Stripe {} }));
vi.mock('../../api/_lib/auth.js', () => ({
  verifyRequestAuth: async () => ({ isInternal: true, userId: null }),
}));

import handler from '../../api/create-monthly-invoice';

function query(table: string) {
  const localFilters: Array<[string, string, unknown]> = [];
  let isUnresolved = false;
  const addFilter = (method: string, column: string, value: unknown) => {
    mocks.filters.push([method, column, value]);
    localFilters.push([method, column, value]);
    return q;
  };
  const q = {
    select(columns: string) {
      isUnresolved = columns.includes('students!inner(payment_model');
      return q;
    },
    eq(column: string, value: unknown) { return addFilter('eq', column, value); },
    in(column: string, value: unknown) { return addFilter('in', column, value); },
    is(column: string, value: unknown) { return addFilter('is', column, value); },
    gte(column: string, value: unknown) { return addFilter('gte', column, value); },
    lte(column: string, value: unknown) { return addFilter('lte', column, value); },
    lt(column: string, value: unknown) { return addFilter('lt', column, value); },
    limit(value: number) { return addFilter('limit', '', value); },
    single: async () => ({
      data: table === 'profiles'
        ? { id: 'tutor-1', full_name: 'Tutor', organization_id: mocks.tutorOrgId }
        : mocks.billingFlags,
      error: null,
    }),
    then(resolve: (value: unknown) => unknown) {
      if (table !== 'sessions') return Promise.resolve({ data: null, error: null }).then(resolve);
      if (isUnresolved) {
        return Promise.resolve({ data: mocks.unresolvedRows, error: mocks.unresolvedError }).then(resolve);
      }
      const statusFilter = localFilters.find(([method, column]) => method === 'in' && column === 'status');
      const selected = statusFilter
        ? mocks.selectedSessions.filter(s => (statusFilter[2] as string[]).includes(s.status as string))
        : mocks.selectedSessions;
      return Promise.resolve({ data: selected, error: null }).then(resolve);
    },
  };
  return q;
}

function response() {
  const res = {
    statusCode: 200,
    body: null as any,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  };
  return res;
}

const body = {
  tutorId: 'tutor-1',
  periodStartDate: '2026-09-01',
  periodEndDate: '2026-09-30',
  paymentDeadlineDays: 14,
  sessionIds: ['lesson-1'],
};

describe('monthly invoice selection at send time', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.filters.length = 0;
    mocks.tutorOrgId = 'org-1';
    mocks.selectedSessions = [];
    mocks.unresolvedRows = [];
    mocks.unresolvedError = null;
    mocks.billingFlags = { enable_per_lesson: false, enable_monthly_billing: true };
    mocks.from.mockImplementation(query);
  });

  it('requires every selected lesson to have a final outcome inside the period', async () => {
    mocks.selectedSessions = [{ id: 'lesson-1', status: 'active' }];
    const res = response();
    await handler({ method: 'POST', headers: { host: 'tutlio.lt' }, body } as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(mocks.filters).toContainEqual(['in', 'status', ['completed', 'no_show']]);
    expect(mocks.filters).toContainEqual(['gte', 'start_time', '2026-09-01T00:00:00']);
    expect(mocks.filters).toContainEqual(['lte', 'start_time', '2026-09-30T23:59:59']);
    expect(mocks.filters).toContainEqual(['lte', 'end_time', expect.any(String)]);
    expect(mocks.from).not.toHaveBeenCalledWith('billing_batches');
  });

  it('blocks only old monthly lessons for a billed Mano payer, including no-show billing', async () => {
    mocks.tutorOrgId = MANO_ID;
    mocks.selectedSessions = [{ id: 'lesson-1', status: 'no_show', students: { payer_email: 'payer@example.test' } }];
    mocks.unresolvedRows = [
      { id: 'old-monthly', students: { payment_model: 'monthly_billing', payer_email: 'payer@example.test' } },
      { id: 'old-inherited', students: { payment_model: null, payer_email: 'payer@example.test' } },
      { id: 'other-payer', students: { payment_model: 'monthly_billing', payer_email: 'other@example.test' } },
      { id: 'per-lesson', students: { payment_model: 'per_lesson', payer_email: 'payer@example.test' } },
    ];
    const res = response();
    await handler({ method: 'POST', headers: { host: 'tutlio.lt' }, body } as any, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ count: 2, sessionIds: ['old-monthly', 'old-inherited'] });
    expect(mocks.filters).toContainEqual(['in', 'status', ['completed', 'no_show']]);
    expect(mocks.filters).toContainEqual(['lt', 'end_time', expect.any(String)]);
    expect(mocks.from).not.toHaveBeenCalledWith('billing_batches');
  });

  it('fails closed if the old-lesson review query fails', async () => {
    mocks.tutorOrgId = MANO_ID;
    mocks.selectedSessions = [{ id: 'lesson-1', status: 'completed', students: { email: 'payer@example.test' } }];
    mocks.unresolvedError = { message: 'database unavailable' };
    const res = response();
    await handler({ method: 'POST', headers: { host: 'tutlio.lt' }, body } as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Unable to review unfinished lessons');
    expect(mocks.from).not.toHaveBeenCalledWith('billing_batches');
  });
});
