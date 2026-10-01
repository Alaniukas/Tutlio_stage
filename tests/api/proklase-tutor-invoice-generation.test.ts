import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  writes: [] as Array<{ table: string; action: string; value?: any }>,
  invoiceError: null as null | { code: string; message: string },
  lineError: null as null | { message: string },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeDb() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => ({ isInternal: true }) }));
vi.mock('../../api/_lib/invoiceNumber.js', () => ({
  allocateInvoiceNumber: async () => 'SF-002', formatInvoiceSeriesHeading: () => 'Serija SF Nr. 2',
}));
vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: async () => new Uint8Array([1]) }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
import handler from '../../api/generate-invoice';

function fakeDb(): any {
  return {
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    from(table: string) {
      const predicates: Array<(row: any) => boolean> = [];
      let action = 'read', value: any;
      const result = () => ({
        data: action === 'insert' ? (table === 'invoices' ? { id: 'new-invoice', ...value } : null)
          : (state.tables[table] || []).filter(row => predicates.every(p => p(row))),
        error: action === 'insert' ? table === 'invoices' ? state.invoiceError
          : table === 'invoice_line_items' ? state.lineError : null : null,
      });
      const q: any = {
        select: () => q, order: () => q,
        eq: (key: string, v: unknown) => { predicates.push(row => row[key] === v); return q; },
        neq: (key: string, v: unknown) => { predicates.push(row => row[key] !== v); return q; },
        in: (key: string, v: unknown[]) => { predicates.push(row => v.includes(row[key])); return q; },
        gte: () => q, lte: () => q,
        insert: (v: any) => { action = 'insert'; value = v; state.writes.push({ table, action, value }); return q; },
        update: (v: any) => { action = 'update'; value = v; state.writes.push({ table, action, value }); return q; },
        delete: () => { action = 'delete'; state.writes.push({ table, action }); return q; },
        single: async () => {
          const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data };
        },
        maybeSingle: async () => {
          const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data };
        },
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return q;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T13:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.writes = []; state.invoiceError = null; state.lineError = null;
  state.tables = {
    profiles: [{ id: 'tutor', full_name: 'Tutor', organization_id: PRO_KLASE_ORG_ID, company_commission_percent: 0 }],
    organizations: [{ id: PRO_KLASE_ORG_ID, entity_type: 'company', name: 'Pro Klasė', email: 'info@example.test' }],
    invoice_profiles: [
      { id: 'personal', user_id: 'tutor', entity_type: 'individual', activity_number: '123', contact_email: 'tutor@example.test' },
      { id: 'organization', organization_id: PRO_KLASE_ORG_ID, entity_type: 'mb', business_name: 'Legal Company',
        company_code: '456', address: 'Vilnius', contact_email: 'info@example.test' },
    ],
    sessions: ['Test', 'Ruste', 'Tomas'].map((name, i) => ({
      id: `lesson-${i}`, tutor_id: 'tutor', student_id: `student-${i}`, status: 'no_show', paid: false,
      price: 10, start_time: '2026-09-19T08:00:00Z', end_time: '2026-09-19T08:45:00Z',
      status_confirmed_at: '2026-09-21T13:00:00Z', students: { full_name: name },
      subjects: { name: 'Bandomoji pamoka', is_trial: true },
    })),
    invoices: [], invoice_line_items: [], tutor_adjustments: [],
  };
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function request(body: any = {}) {
  const res: any = { code: 200, body: null, status(code: number) { res.code = code; return res; },
    json(value: any) { res.body = value; return res; } };
  await handler({ method: 'POST', body: { tutorId: 'tutor', periodStart: '2026-08-04', periodEnd: '2026-10-01',
    groupingType: 'single', isOrgTutor: true, onlyPaid: true, sessionIds: ['lesson-0', 'lesson-1', 'lesson-2'], ...body } } as any, res);
  return res;
}

describe('Pro Klasė tutor invoice generation', () => {
  it('issues the three confirmed no-shows for €18 in the personal seller scope without changing client payments', async () => {
    const res = await request();
    expect(res.body).toMatchObject({ success: true, count: 1, invoiceIds: ['new-invoice'] });
    expect(state.writes.find(w => w.table === 'invoices' && w.action === 'insert')?.value).toMatchObject({
      invoice_number: 'SF-002', seller_user_id: 'tutor', total_amount: 18,
      buyer_snapshot: { name: 'Legal Company' },
    });
    expect(state.writes.find(w => w.table === 'invoice_line_items')?.value.reduce((sum: number, li: any) => sum + li.total_price, 0)).toBe(18);
    expect(state.writes.some(w => w.table === 'sessions')).toBe(false);
  });
  it('uses the billed tutor identity when an administrator issues the invoice', async () => {
    await request({ issuedByUserId: 'admin' });
    expect(state.writes.find(w => w.table === 'invoices' && w.action === 'insert')?.value).toMatchObject({
      issued_by_user_id: 'admin', seller_user_id: 'tutor',
    });
  });
  it('returns a serial conflict instead of success with zero invoices', async () => {
    state.invoiceError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const res = await request();
    expect(res.code).toBe(409);
    expect(res.body).toMatchObject({ count: 0, error: expect.stringContaining('numeris') });
    expect(res.body.success).toBeUndefined();
    expect(state.writes.some(w => w.table === 'invoice_line_items')).toBe(false);
  });
  it('reports other invoice write errors without claiming that lessons were not found', async () => {
    state.invoiceError = { code: 'XX000', message: 'unavailable' };
    const res = await request();
    expect(res.code).toBe(500);
    expect(res.body.error).toContain('Nepavyko sukurti sąskaitos');
  });
  it('removes an invoice shell and reports failure when its lesson lines cannot be saved', async () => {
    state.lineError = { message: 'unavailable' };
    const res = await request();
    expect(res.code).toBe(500);
    expect(res.body.error).toContain('Nepavyko įrašyti');
    expect(state.writes).toContainEqual({ table: 'invoices', action: 'delete' });
    expect(state.writes.some(w => w.table === 'sessions')).toBe(false);
  });
  it('keeps organization sales invoices in the organization scope', async () => {
    await request({ isOrgTutor: false });
    expect(state.writes.find(w => w.table === 'invoices' && w.action === 'insert')?.value).toMatchObject({
      seller_user_id: null, seller_snapshot: { name: 'Legal Company' },
    });
  });
});
