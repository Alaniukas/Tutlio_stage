import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANO_KOREPETITORIUS_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  filters: [] as Array<[string, string, unknown]>,
  profileRate: 0,
  invoiceRows: [] as Array<Record<string, unknown>>,
  itemRows: [] as Array<Record<string, unknown>>,
  itemError: null as null | { message: string },
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('../../api/_lib/auth.js', () => ({
  verifyRequestAuth: async () => ({ isInternal: true, userId: null }),
}));

import handler from '../../api/generate-invoice';

function query(table: string) {
  const q = {
    select() { return q; },
    eq(column: string, value: unknown) { mocks.filters.push(['eq', column, value]); return q; },
    in(column: string, value: unknown) { mocks.filters.push(['in', column, value]); return q; },
    overlaps(column: string, value: unknown) { mocks.filters.push(['overlaps', column, value]); return q; },
    gte(column: string, value: unknown) { mocks.filters.push(['gte', column, value]); return q; },
    lte(column: string, value: unknown) { mocks.filters.push(['lte', column, value]); return q; },
    neq(column: string, value: unknown) { mocks.filters.push(['neq', column, value]); return q; },
    order() { return q; },
    single: async () => ({
      data: { id: 'tutor-1', full_name: 'Tutor', organization_id: MANO_KOREPETITORIUS_ORG_ID,
        company_commission_percent: mocks.profileRate, company_commission_by_subject: {} },
      error: null,
    }),
    maybeSingle: async () => ({ data: null, error: null }),
    then(resolve: (value: unknown) => unknown) {
      const sessions = [{ id: 'lesson-1', tutor_id: 'tutor-1', status: 'completed',
        start_time: '2026-09-15T10:00:00Z', end_time: '2026-09-15T11:00:00Z',
        subject_id: 'math', price: 40, tutor_pay_eur_snapshot: null }];
      const data = table === 'sessions' ? sessions
        : table === 'invoices' ? mocks.invoiceRows
          : table === 'invoice_line_items' ? mocks.itemRows : [];
      const error = table === 'invoice_line_items' ? mocks.itemError : null;
      return Promise.resolve({ data, error }).then(resolve);
    },
  };
  return q;
}

function response() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  };
  return res;
}

describe('Mano tutor invoice precheck', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.filters.length = 0;
    mocks.profileRate = 0;
    mocks.invoiceRows = [];
    mocks.itemRows = [];
    mocks.itemError = null;
    mocks.from.mockImplementation(query);
  });

  it('rejects missing pay before allocating an invoice number', async () => {
    const res = response();
    await handler({ method: 'POST', body: {
      tutorId: 'tutor-1', periodStart: '2026-09-01', periodEnd: '2026-09-30',
      groupingType: 'single', isOrgTutor: true, precheckOnly: true,
    } } as any, res as any);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringContaining('atlygis') }));
    expect(mocks.filters).toContainEqual(['in', 'status', ['completed', 'no_show']]);
    expect(mocks.from).not.toHaveBeenCalledWith('invoices');
  });

  it('rejects packages in a tutor pay invoice before loading package rows', async () => {
    mocks.profileRate = 20;
    const res = response();
    await handler({ method: 'POST', body: {
      tutorId: 'tutor-1', periodStart: '2026-09-01', periodEnd: '2026-09-30',
      groupingType: 'single', isOrgTutor: true, precheckOnly: true,
      packageIds: ['package-1'],
    } } as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(mocks.from).not.toHaveBeenCalledWith('lesson_packages');
  });

  it('requires one monthly tutor invoice instead of splitting the lessons', async () => {
    mocks.profileRate = 20;
    const res = response();
    await handler({ method: 'POST', body: {
      tutorId: 'tutor-1', periodStart: '2026-09-01', periodEnd: '2026-09-30',
      groupingType: 'per_week', isOrgTutor: true, precheckOnly: true,
    } } as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(mocks.from).not.toHaveBeenCalledWith('sessions');
  });

  it('rejects a lesson already on a tutor invoice in another period', async () => {
    mocks.profileRate = 20;
    mocks.itemRows = [{ invoice_id: 'earlier-tutor-invoice', session_ids: ['lesson-1'] }];
    mocks.invoiceRows = [{ id: 'earlier-tutor-invoice', invoice_number: 'T-123', total_amount: 20,
      pdf_meta: { layout: 'classic_lt_tutor' } }];
    const res = response();
    await handler({ method: 'POST', body: {
      tutorId: 'tutor-1', periodStart: '2026-09-01', periodEnd: '2026-09-30',
      groupingType: 'single', isOrgTutor: true, precheckOnly: true,
    } } as any, res as any);

    expect(mocks.filters).toContainEqual(['overlaps', 'session_ids', ['lesson-1']]);
    expect(mocks.filters).not.toContainEqual(['eq', 'period_start', '2026-09-01']);
    expect(res.body).toEqual(expect.objectContaining({ canGenerate: false, reason: 'duplicate' }));
  });

  it('does not mistake the customer sales invoice for a tutor invoice', async () => {
    mocks.profileRate = 20;
    mocks.itemRows = [{ invoice_id: 'customer-invoice', session_ids: ['lesson-1'] }];
    mocks.invoiceRows = [{ id: 'customer-invoice', invoice_number: 'S-123', total_amount: 40,
      pdf_meta: { layout: 'pvm_education' } }];
    const res = response();
    await handler({ method: 'POST', body: {
      tutorId: 'tutor-1', periodStart: '2026-09-01', periodEnd: '2026-09-30',
      groupingType: 'single', isOrgTutor: true, precheckOnly: true,
    } } as any, res as any);

    expect(res.body).toEqual(expect.objectContaining({ canGenerate: true }));
  });

  it('fails closed when duplicate lookup fails', async () => {
    mocks.profileRate = 20;
    mocks.itemError = { message: 'database unavailable' };
    const res = response();
    await handler({ method: 'POST', body: {
      tutorId: 'tutor-1', periodStart: '2026-09-01', periodEnd: '2026-09-30',
      groupingType: 'single', isOrgTutor: true, precheckOnly: true,
    } } as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(mocks.from).not.toHaveBeenCalledWith('invoices');
  });
});
