import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_QA_ORG_ID } from '../../src/lib/marketMoney';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({
  userId: 'tutor' as string | null, admin: null as any, errorTable: '',
  tables: {} as Record<string, any[]>, queries: [] as RowQueryLog[], writes: [] as any[],
  pdf: vi.fn(async (_data: any) => new Uint8Array([1])),
  upload: vi.fn(async () => ({ error: null })), download: vi.fn(async () => ({ data: null })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  storage: { from: () => ({ upload: state.upload, download: state.download }) },
  from(table: string) {
    const q = rowQuery(table, table => state.tables[table] || [], state.queries, state.writes);
    if (state.errorTable === table) q.then = (resolve: any, reject: any) =>
      Promise.resolve({ data: null, error: { message: 'Private database failure' } }).then(resolve, reject);
    return q;
  },
}) }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId } : null }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.admin }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: (data: any) => state.pdf(data) }));
import handler from '../../api/invoice-pdf';

function session(id: string, status: string, isTrial: boolean) {
  return { id, tutor_id: 'tutor', status, status_confirmed_at: '2026-09-30T18:00:00Z',
    subjects: { name: isTrial ? 'Bandomoji pamoka' : 'LIETUVIŲ KALBA', is_trial: isTrial },
    students: { organization_id: PRO_KLASE_QA_ORG_ID } };
}
beforeEach(() => {
  state.userId = 'tutor'; state.admin = null; state.errorTable = ''; state.queries = []; state.writes = [];
  state.pdf.mockClear(); state.upload.mockClear(); state.download.mockClear();
  state.tables = {
    organizations: [{ id: PRO_KLASE_QA_ORG_ID, name: 'QA Organization' }],
    invoice_profiles: [], profiles: [{ id: 'tutor', company_commission_percent: 99 }],
    invoices: [{ id: 'invoice', invoice_number: 'LIELIN-001', organization_id: PRO_KLASE_QA_ORG_ID,
      issued_by_user_id: 'admin', status: 'paid', issue_date: '2026-10-05',
      period_start: '2026-09-01', period_end: '2026-09-30', total_amount: 61,
      seller_snapshot: { name: 'Tutor', entityType: 'individual' }, buyer_snapshot: { name: 'QA Organization' },
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'tutor' }, pdf_storage_path: 'old-average.pdf' }],
    invoice_line_items: [
      { id: '1', invoice_id: 'invoice', description: 'LIETUVIŲ KALBA - korepetavimo paslaugos',
        quantity: 3, unit_price: 13, total_price: 39, session_ids: ['r1', 'r2', 'r3'] },
      { id: '2', invoice_id: 'invoice', description: 'Bandomoji pamoka - korepetavimo paslaugos',
        quantity: 4, unit_price: 8, total_price: 32, session_ids: ['t1', 't2', 'n1', 'n2'] },
      { id: '3', invoice_id: 'invoice', description: 'Bauda: nėra ataskaitos',
        quantity: 1, unit_price: -10, total_price: -10, session_ids: [] },
    ],
    sessions: [session('r1', 'completed', false), session('r2', 'completed', false),
      session('r3', 'completed', false), session('t1', 'completed', true), session('t2', 'completed', true),
      session('n1', 'no_show', true), session('n2', 'no_show', true)],
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
async function request() {
  const res: any = { code: 0, body: null, headers: {},
    status(code: number) { this.code = code; return this; },
    json(body: any) { this.body = body; return this; }, send(body: any) { this.body = body; return this; },
    setHeader(key: string, value: string) { this.headers[key] = value; },
  };
  await handler({ method: 'GET', query: { id: 'invoice' } } as any, res);
  return res;
}

describe('Pro Klasė tutor PDF separate tariffs', () => {
  it('downloads the existing 62 EUR invoice with three exact tariffs instead of the 10.33 EUR average', async () => {
    Object.assign(state.tables.invoices[0], { invoice_number: 'EDMVAL-001', total_amount: 62 });
    state.tables.sessions = [session('t1', 'completed', true), session('r1', 'completed', false),
      session('n1', 'no_show', true), session('r2', 'completed', false), session('r3', 'completed', false),
      session('t2', 'completed', true)].map(row => ({ ...row, subjects: { ...row.subjects, name: 'MATEMATIKA' } }));
    state.tables.invoice_line_items = [{ id: '1', invoice_id: 'invoice',
      description: 'MATEMATIKA - korepetavimo paslaugos', quantity: 6, unit_price: '10.33', total_price: '62.00',
      session_ids: state.tables.sessions.map(row => row.id) }];
    const originalLines = structuredClone(state.tables.invoice_line_items);
    const res = await request();
    expect(res.code).toBe(200);
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ invoiceNumber: 'EDMVAL-001', totalAmount: 62,
      lineItems: [
        { description: 'Bandomoji pamoka - MATEMATIKA', quantity: 2, unitPrice: 10, totalPrice: 20 },
        { description: 'MATEMATIKA - korepetavimo paslaugos', quantity: 3, unitPrice: 12, totalPrice: 36 },
        { description: 'Atlygis už mokinio neatvykimą - MATEMATIKA', quantity: 1, unitPrice: 6, totalPrice: 6 },
      ],
    });
    expect(state.tables.invoice_line_items).toEqual(originalLines);
    expect(state.tables.invoices[0]).toMatchObject({ total_amount: 62, status: 'paid' });
    expect(state.download).not.toHaveBeenCalled();
    expect(state.writes.every(write => write.table === 'invoices' && Object.keys(write.value).join() === 'pdf_storage_path')).toBe(true);
  });

  it.each(['tutor', 'admin'])('splits the saved legacy invoice for an authorized %s and preserves its financial records', async user => {
    state.userId = user;
    if (user === 'admin') state.admin = { organizationId: PRO_KLASE_QA_ORG_ID, role: 'owner', permissions: {} };
    const originalLines = structuredClone(state.tables.invoice_line_items);
    const res = await request();
    expect(res.code).toBe(200);
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ invoiceNumber: 'LIELIN-001', totalAmount: 61,
      lineItems: [
        { quantity: 3, unitPrice: 13, totalPrice: 39 },
        { description: 'Bandomoji pamoka - korepetavimo paslaugos', quantity: 2, unitPrice: 10, totalPrice: 20 },
        { description: 'Atlygis už mokinio neatvykimą - Bandomoji pamoka', quantity: 2, unitPrice: 6, totalPrice: 12 },
        { description: 'Bauda: nėra ataskaitos', quantity: 1, unitPrice: -10, totalPrice: -10 },
      ],
    });
    expect(state.download).not.toHaveBeenCalled();
    expect(state.tables.invoice_line_items).toEqual(originalLines);
    expect(state.tables.invoices[0]).toMatchObject({ total_amount: 61, status: 'paid' });
    expect(state.writes.every(write => write.table === 'invoices' && Object.keys(write.value).join() === 'pdf_storage_path')).toBe(true);
    expect(state.queries.filter(query => query.table === 'sessions').every(query =>
      query.filters.some(filter => filter[0] === 'eq' && filter[1] === 'tutor_id' && filter[2] === 'tutor')
      && query.filters.some(filter => filter[0] === 'eq' && filter[1] === 'students.organization_id' && filter[2] === PRO_KLASE_QA_ORG_ID))).toBe(true);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('uses frozen separate lines for new invoices even after lessons or tutor rates change', async () => {
    state.tables.invoices[0].pdf_meta.proKlaseTutorPayLineVersion = 1;
    const trialLine = state.tables.invoice_line_items[1];
    state.tables.invoice_line_items.splice(1, 1,
      { ...trialLine, quantity: 2, unit_price: 10, total_price: 20, session_ids: ['t1', 't2'] },
      { ...trialLine, id: '2b', description: 'Atlygis už mokinio neatvykimą - Bandomoji pamoka',
        quantity: 2, unit_price: 6, total_price: 12, session_ids: ['n1', 'n2'] });
    state.tables.sessions = [];
    expect((await request()).code).toBe(200);
    expect(state.pdf.mock.calls[0][0].lineItems.map((line: any) => line.unitPrice)).toEqual([13, 10, 6, -10]);
    expect(state.queries.some(query => query.table === 'sessions' || query.table === 'profiles')).toBe(false);
  });

  it.each(['missing', 'changed', 'foreign_student', 'other_tutor', 'removed_subject'])('blocks an unprovable legacy split (%s) without serving or caching an average', async kind => {
    if (kind === 'missing') state.tables.sessions = state.tables.sessions.filter(row => row.id !== 'n1');
    if (kind === 'changed') state.tables.sessions.forEach(row => { row.status = 'completed'; });
    if (kind === 'foreign_student') state.tables.sessions[0].students.organization_id = 'foreign';
    if (kind === 'other_tutor') state.tables.sessions[0].tutor_id = 'other';
    if (kind === 'removed_subject') state.tables.sessions[0].subjects = null;
    const res = await request();
    expect(res.code).toBe(409);
    expect(state.pdf).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
    expect(state.download).not.toHaveBeenCalled();
  });

  it.each(['sessions', 'invoice_line_items'])('fails closed when %s cannot be loaded', async table => {
    state.errorTable = table;
    const res = await request();
    expect(res.code).toBe(503); expect(JSON.stringify(res.body)).not.toContain('Private database');
    expect(state.pdf).not.toHaveBeenCalled(); expect(state.writes).toEqual([]);
  });

  it.each(['foreign_admin', 'other_tutor'])('denies %s before loading any lesson or line details', async user => {
    state.userId = 'other';
    if (user === 'foreign_admin') state.admin = { organizationId: 'foreign', role: 'owner', permissions: {} };
    expect((await request()).code).toBe(403);
    expect(state.queries.some(query => query.table === 'sessions' || query.table === 'invoice_line_items')).toBe(false);
  });
});
