import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qaAdjustments, qaClock, qaExpected, qaInvoiceProfiles, qaInvoices, qaOrganizations, qaProfiles, qaSessions } from '../fixtures/tutor-environment-finance';
import { rowQuery } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({ company: 0, tables: {} as Record<string, any[]>, writes: [] as any[], failedTable: '', pdfs: [] as any[] }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: (table: string) => {
    const query = rowQuery(table, key => state.tables[key] || [], [], state.writes);
    if (table === state.failedTable) query.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: new Error('Pay adjustments unavailable') }).then(resolve, reject);
    return query;
  },
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
}) }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => ({ isInternal: false, userId: state.tables.profiles[state.company].id }) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => null }));
vi.mock('../../api/_lib/invoiceNumber.js', () => ({ allocateInvoiceNumber: async () => 'QA-001', formatInvoiceSeriesHeading: () => 'QA' }));
vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: async (data: any) => { state.pdfs.push(data); return new Uint8Array([1]); } }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
import generate from '../../api/generate-invoice';
import list from '../../api/org-tutor-invoices';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(qaClock));
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-only';
  state.writes = []; state.failedTable = ''; state.pdfs = [];
  state.tables = { profiles: qaProfiles, organizations: qaOrganizations, sessions: qaSessions,
    invoice_profiles: qaInvoiceProfiles, invoices: qaInvoices, tutor_adjustments: qaAdjustments };
});
afterEach(() => vi.useRealTimers());
async function request(handler: any, body: any = {}, query = {}) {
  const res: any = { code: 200, body: null, setHeader() {}, status(code: number) { res.code = code; return res; },
    json(value: any) { res.body = value; return res; } };
  await handler({ method: handler === list ? 'GET' : 'POST', query, body: {
    tutorId: qaProfiles[state.company].id, isOrgTutor: true, groupingType: 'single', onlyPaid: true,
    periodStart: '2026-10-01', periodEnd: '2026-10-31', ...body,
  } }, res);
  return res;
}

describe('company selection preserves tutor-pay accounting and authorization', () => {
  it.each([0, 1])('generates company %i at the exact summary/preview total, including unpaid lessons', async company => {
    state.company = company;
    const result = await request(generate);
    expect(result.code, JSON.stringify(result.body)).toBe(200);
    const invoice = state.writes.find(write => write.table === 'invoices' && write.value.total_amount)?.value;
    expect(invoice).toMatchObject({ total_amount: qaExpected[company].total,
      organization_id: qaOrganizations[company].id, issued_by_user_id: qaProfiles[company].id,
      seller_user_id: qaProfiles[company].id, buyer_snapshot: { name: qaOrganizations[company].name },
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: qaProfiles[company].id } });
    const lines = state.writes.find(write => write.table === 'invoice_line_items')?.value;
    const eligible = qaSessions.filter(row => row.tutor_id === qaProfiles[company].id
      && ['completed', 'no_show'].includes(row.status) && row.start_time.startsWith('2026-10')
      && (company !== 0 || row.status_confirmed_at));
    expect(lines.flatMap((line: any) => line.session_ids).sort()).toEqual(eligible.map(row => row.id).sort());
    expect(lines.reduce((sum: number, line: any) => sum + line.total_price, 0)).toBe(qaExpected[company].total);
    expect(state.pdfs).toHaveLength(1);
    expect(state.pdfs[0]).toMatchObject({ totalAmount: qaExpected[company].total, buyer: { name: qaOrganizations[company].name } });
    expect(state.pdfs[0].lineItems.reduce((sum: number, line: any) => sum + line.totalPrice, 0)).toBe(qaExpected[company].total);
    if (company === 0) expect(lines.find((line: any) => line.total_price === -10)).toMatchObject({ session_ids: [] });
    expect(state.writes.some(write => ['sessions', 'students', 'profiles'].includes(write.table))).toBe(false);
  });
  it.each([0, 1])('lists only company %i tutor-pay invoices despite a forged other-company query', async company => {
    state.company = company;
    const result = await request(list, {}, { tutorId: qaProfiles[1 - company].id, organizationId: qaOrganizations[1 - company].id });
    expect(result.code).toBe(200);
    expect(result.body.invoices.map((invoice: any) => invoice.invoice_number)).toEqual([qaExpected[company].invoice]);
  });
  it.each([0, 1])('refuses company %i invoice generation on behalf of the other assigned login', async company => {
    state.company = company;
    expect((await request(generate, { tutorId: qaProfiles[1 - company].id })).code).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it('refuses to issue an overstated invoice if the pay adjustments cannot be loaded', async () => {
    state.company = 0; state.failedTable = 'tutor_adjustments';
    expect((await request(generate)).code).toBe(500);
    expect(state.writes).toHaveLength(0);
  });
  it.each([0, 1])('rejects future or out-of-period lesson IDs for company %i', async company => {
    state.company = company;
    for (const row of qaSessions.filter(row => row.tutor_id === qaProfiles[company].id
      && (row.status === 'active' || row.start_time.startsWith('2026-09')))) {
      expect((await request(generate, { sessionIds: [row.id] })).code).toBe(409);
    }
    expect(state.writes).toHaveLength(0);
  });
});
