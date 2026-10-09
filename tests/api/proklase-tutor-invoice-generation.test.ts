import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';
import { rowQuery } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  writes: [] as Array<{ table: string; action: string; value?: any }>,
  invoiceError: null as null | { code: string; message: string },
  lineError: null as null | { message: string },
  errorTable: '',
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeDb() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => ({ isInternal: true }) }));
vi.mock('../../api/_lib/invoiceNumber.js', () => ({
  allocateInvoiceNumber: async () => 'SF-002', formatInvoiceSeriesHeading: () => 'Serija SF Nr. 2',
  formatStoredInvoiceNumber: (series: string, n: number) => `${series}-${String(n).padStart(3, '0')}`,
}));
vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: async () => new Uint8Array([1]) }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
import handler from '../../api/generate-invoice';

function fakeDb(): any {
  return {
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    rpc: async (name: string, args: any) => {
      if (name === 'allocate_org_tutor_invoice_number') return { data: [{ invoice_series: args.p_default_series, allocated_number: 2 }], error: null };
      if (name !== 'create_org_tutor_pay_invoice') throw new Error(`Unexpected RPC ${name}`);
      if (state.invoiceError || state.lineError) return { data: null, error: state.invoiceError || state.lineError };
      const invoice = { id: 'new-invoice', ...args.p_invoice, created_at: new Date().toISOString() };
      state.tables.invoices.push(invoice);
      const lines = args.p_lines.map((line: any, i: number) => ({ id: `new-line-${i}`, invoice_id: invoice.id, ...line }));
      state.tables.invoice_line_items.push(...lines);
      state.writes.push({ table: 'invoices', action: 'insert', value: invoice },
        { table: 'invoice_line_items', action: 'insert', value: lines });
      return { data: invoice, error: null };
    },
    from(table: string) {
      const q = rowQuery(table, table => state.tables[table] || []);
      for (const action of ['insert', 'update', 'delete']) {
        const original = q[action];
        q[action] = (value: any) => { state.writes.push({ table, action, value }); return original(value); };
      }
      if (state.errorTable === table) q.then = (resolve: any, reject: any) =>
        Promise.resolve({ data: null, error: { message: 'Private database failure' } }).then(resolve, reject);
      return q;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T13:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.writes = []; state.invoiceError = null; state.lineError = null; state.errorTable = '';
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
      status_confirmed_at: '2026-09-21T13:00:00Z', students: { full_name: name, organization_id: PRO_KLASE_ORG_ID },
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
      invoice_number: 'TUT-002', seller_user_id: 'tutor', total_amount: 18,
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
  it('reports an atomic save failure without leaving an invoice shell when its lesson lines cannot be saved', async () => {
    state.lineError = { message: 'unavailable' };
    const res = await request();
    expect(res.code).toBe(500);
    expect(res.body.error).toContain('Nepavyko sukurti');
    expect(state.writes).toEqual([]);
    expect(state.tables.invoices).toEqual([]);
    expect(state.writes.some(w => w.table === 'sessions')).toBe(false);
  });
  it('keeps organization sales invoices in the organization scope', async () => {
    await request({ isOrgTutor: false });
    expect(state.writes.find(w => w.table === 'invoices' && w.action === 'insert')?.value).toMatchObject({
      seller_user_id: null, seller_snapshot: { name: 'Legal Company' },
    });
  });
  it('omits early October lessons already invoiced in a September-to-October period', async () => {
    state.tables.invoices = [{ id: 'old', invoice_number: 'SF-001', organization_id: PRO_KLASE_ORG_ID, status: 'paid',
      period_start: '2026-09-01', period_end: '2026-10-02', total_amount: 12, created_at: '2026-10-01T12:00:00Z',
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'tutor' } }];
    state.tables.invoice_line_items = [{ id: 'old-line', invoice_id: 'old', session_ids: ['lesson-0'], total_price: 6 }];
    state.tables.sessions[0].start_time = '2026-10-01T08:00:00Z';
    state.tables.sessions[0].end_time = '2026-10-01T08:45:00Z';
    const result = await request({ precheckOnly: true, sessionIds: undefined });
    expect(result.code).toBe(200);
    expect(result.body).toMatchObject({ canGenerate: true, eligibleSessionIds: ['lesson-1', 'lesson-2'], candidateCount: 2, candidateTotal: 12 });
    expect(state.writes).toEqual([]);
    const issued = await request({ sessionIds: ['lesson-1', 'lesson-2'] });
    expect(issued.code).toBe(200);
    const lines = state.writes.find(write => write.table === 'invoice_line_items')!.value;
    expect(lines.flatMap((line: any) => line.session_ids).sort()).toEqual(['lesson-1', 'lesson-2']);
    expect(state.tables.invoices.at(-1).total_amount).toBe(12);
  });
  it('blocks a selection containing only already billed lessons without creating another invoice', async () => {
    await request(); state.writes = [];
    const duplicate = await request({ periodStart: '2026-09-01', periodEnd: '2026-09-30' });
    expect(duplicate.code).toBe(409);
    expect(duplicate.body.reason).toBe('duplicate');
    expect(state.writes).toEqual([]);
  });
  it.each([{ pdf_meta: null }, { status: 'cancelled' }, { pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'other' } }])
    ('does not let unrelated or cancelled invoices block tutor pay: %j', async overrides => {
      await request(); Object.assign(state.tables.invoices[0], overrides); state.writes = [];
      expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true, candidateCount: 3 });
    });
  it('deducts historical fines only once and includes a later manual correction', async () => {
    state.tables.invoices = [{ id: 'old', invoice_number: 'SF-001', organization_id: PRO_KLASE_ORG_ID, status: 'paid',
      period_start: '2026-09-01', period_end: '2026-09-30', created_at: '2026-09-21T12:00:00Z', total_amount: 10,
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'tutor' } }];
    state.tables.invoice_line_items = [{ id: 'old-line', invoice_id: 'old', session_ids: [], description: 'Bauda: nėra ataskaitos', total_price: -10 }];
    state.tables.tutor_adjustments = [
      { id: 'fine', tutor_id: 'tutor', organization_id: PRO_KLASE_ORG_ID, type: 'penalty_missing_report', amount_eur: -10, created_at: '2026-09-20T12:00:00Z' },
      { id: 'correction', tutor_id: 'tutor', organization_id: PRO_KLASE_ORG_ID, type: 'penalty_manual', amount_eur: 10, reason: 'Correction', created_at: '2026-09-22T12:00:00Z' },
    ];
    expect((await request({ precheckOnly: true })).body).toMatchObject({ adjustmentsEur: 10, candidateTotal: 28 });
    await request();
    expect(state.tables.invoices.at(-1).pdf_meta.tutorAdjustmentIds).toEqual(['correction']);
    expect(state.tables.tutor_adjustments.map(row => row.amount_eur)).toEqual([-10, 10]);
  });
  it('loads every session and historical invoice line beyond the response cap', async () => {
    state.tables.sessions = Array.from({ length: 1201 }, (_, i) => ({ ...state.tables.sessions[0], id: `lesson-${String(i).padStart(5, '0')}` }));
    state.tables.invoices = [{ id: 'old', invoice_number: 'SF-001', organization_id: PRO_KLASE_ORG_ID, status: 'paid',
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'tutor' } }];
    state.tables.invoice_line_items = state.tables.sessions.slice(0, 1101).map((session, i) => ({ id: `line-${i}`, invoice_id: 'old', session_ids: [session.id] }));
    expect((await request({ precheckOnly: true, sessionIds: undefined })).body).toMatchObject({ candidateCount: 100, candidateTotal: 600 });
  });
  it.each(['invoices', 'invoice_line_items', 'tutor_adjustments'])('fails closed when %s coverage cannot be read', async table => {
    state.tables.invoices = [{ id: 'old', organization_id: PRO_KLASE_ORG_ID, status: 'paid', pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'tutor' } }];
    state.errorTable = table;
    expect((await request()).code).toBe(500);
    expect(state.writes).toEqual([]);
  });
  it('returns a refresh conflict if another request billed the lessons after preview', async () => {
    state.invoiceError = { code: '40001', message: 'Concurrent invoice' };
    const result = await request();
    expect(result.code).toBe(409);
    expect(result.body.error).toContain('peržiūrą');
    expect(state.writes).toEqual([]);
  });
  it('requires one remuneration invoice per request so adjustments cannot be repeated across groups', async () => {
    expect((await request({ groupingType: 'per_payment' })).code).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it('excludes a tutor’s lessons for students in another organization from the period preview', async () => {
    state.tables.sessions[0].students.organization_id = 'foreign';
    const result = await request({ precheckOnly: true, sessionIds: undefined });
    expect(result.body).toMatchObject({ canGenerate: true, candidateCount: 2, candidateTotal: 12,
      eligibleSessionIds: ['lesson-1', 'lesson-2'] });
    expect(state.writes).toEqual([]);
  });
});
