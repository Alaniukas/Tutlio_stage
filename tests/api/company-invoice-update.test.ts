import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';
import { PRO_KLASE_QA_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn(), tables: {} as Record<string, any[]>,
  logs: [] as RowQueryLog[], writes: [] as any[], zeroUpdate: false, failedUpdate: false }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: state.access }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: state.rpc, from: (table: string) => {
  const query = rowQuery(table, table => state.tables[table] || [], state.logs, state.writes);
  const log = state.logs.at(-1)!;
  const then = query.then;
  query.then = (resolve: any, reject: any) => then((result: any) => {
    if (log.operation === 'update') {
      if (state.failedUpdate) return resolve({ data: null, error: { message: 'Private database failure' } });
      if (state.zeroUpdate) return resolve({ data: null, error: null });
      if (result.data) state.tables[table] = state.tables[table].map(row => row.id === result.data.id ? result.data : row);
    }
    return resolve(result);
  }, reject);
  return query;
} }) }));
import handler from '../../api/company-invoice-update';
const invoiceId = 'b0a00000-7e57-4000-8000-000000000020';
const tutorId = 'b0a00000-7e57-4000-8000-000000000003';
beforeEach(() => {
  state.logs = []; state.writes = []; state.zeroUpdate = false; state.failedUpdate = false;
  state.access.mockReset().mockResolvedValue({ ok: true, access: { organizationId: PRO_KLASE_QA_ORG_ID, userId: 'admin' } });
  state.rpc.mockReset().mockImplementation(async (_name, args) => {
    const row = { ...state.tables.invoices[0], invoice_number: args.p_new_number };
    state.tables.invoices[0] = row;
    return { data: row, error: null };
  });
  state.tables = { invoices: [{ id: invoiceId, invoice_number: 'SF-001', organization_id: PRO_KLASE_QA_ORG_ID,
    status: 'issued', origin: 'generated', total_amount: 125, pdf_meta: { invoiceKind: 'tutor_pay', tutorId, tutorAdjustmentIds: ['fine'] } }],
    sessions: [{ id: 'lesson', paid: false }] };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
async function request(body: any = {}, method = 'POST') {
  const res: any = { code: 0, body: null, setHeader: vi.fn(), status(code: number) { res.code = code; return res; },
    json(value: any) { res.body = value; return res; } };
  await handler({ method, body: { action: 'mark_paid', invoiceId, ...body } } as any, res);
  return res;
}

describe('administrator invoice save confirmation', () => {
  it.each([401, 403])('requires finance.edit before accessing data (%s)', async status => {
    state.access.mockResolvedValue({ ok: false, status, error: 'Denied' });
    expect((await request()).code).toBe(status);
    expect(state.access.mock.calls[0][2]).toBe('finance.edit');
    expect(state.logs).toEqual([]);
  });
  it('scopes the invoice to the authenticated organization, ignoring caller organization IDs', async () => {
    state.tables.invoices[0].organization_id = 'foreign';
    expect((await request({ organizationId: 'foreign' })).code).toBe(404);
    expect(state.writes).toEqual([]);
  });
  it('returns the saved paid state and preserves it on a subsequent read without changing student payments', async () => {
    const result = await request();
    expect(result.code).toBe(200);
    expect(result.body.invoice).toMatchObject({ id: invoiceId, status: 'paid', total_amount: 125,
      pdf_meta: { tutorAdjustmentIds: ['fine'], manualPayment: { confirmedBy: 'admin' } } });
    expect((await request()).body.invoice.status).toBe('paid');
    expect(state.writes).toHaveLength(1);
    expect(state.tables.sessions).toEqual([{ id: 'lesson', paid: false }]);
    expect(result.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('does not report success when the database updates zero rows', async () => {
    state.zeroUpdate = true;
    expect((await request()).code).toBe(409);
    expect(state.tables.invoices[0].status).toBe('issued');
  });
  it('reports a save failure without exposing database details', async () => {
    state.failedUpdate = true;
    const result = await request();
    expect(result.code).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain('Private database');
  });
  it.each([{ origin: 'external' }, { status: 'cancelled' }, { billing_batch_id: 'batch' }])('rejects ineligible invoices %j', async overrides => {
    Object.assign(state.tables.invoices[0], overrides);
    expect((await request()).code).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it('rejects unsupported methods and invalid actions', async () => {
    expect((await request({}, 'GET')).code).toBe(405);
    expect((await request({ action: 'delete' })).code).toBe(400);
    expect((await request({ invoiceId: 'invalid' })).code).toBe(400);
  });
});

const rename = (overrides: Record<string, unknown> = {}) => request({ action: 'change_number', expectedNumber: 'SF-001', invoiceNumber: 'domsma-001', ...overrides });
describe('administrator tutor invoice number correction', () => {
  it('saves normalized separate tutor numbers through the atomic scoped operation', async () => {
    const result = await rename();
    expect(result.code).toBe(200);
    expect(result.body.invoice).toMatchObject({ invoice_number: 'DOMSMA-001', status: 'issued', total_amount: 125 });
    expect(state.rpc).toHaveBeenCalledWith('correct_org_tutor_invoice_number', {
      p_organization_id: PRO_KLASE_QA_ORG_ID, p_invoice_id: invoiceId, p_expected_number: 'SF-001',
      p_new_number: 'DOMSMA-001', p_changed_by: 'admin',
    });
  });
  it.each([{ pdf_meta: null }, { organization_id: 'another-org' }])('rejects customer or foreign invoices %j', async overrides => {
    Object.assign(state.tables.invoices[0], overrides);
    expect((await rename()).code).toBe(overrides.pdf_meta === null ? 403 : 404);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each(['23505', '40001'])('reports a number collision or stale edit as a conflict (%s)', async code => {
    state.rpc.mockResolvedValue({ data: null, error: { code, message: 'Private SQL detail' } });
    const result = await rename();
    expect(result.code).toBe(409);
    expect(JSON.stringify(result.body)).not.toContain('Private SQL');
  });
  it.each([null, { id: invoiceId, invoice_number: 'SF-001' }])('requires the corrected row to be returned (%j)', async data => {
    state.rpc.mockResolvedValue({ data, error: null });
    expect((await rename()).code).toBe(503);
  });
  it.each(['', 'X'.repeat(61), '<script>', 'SF 001'])('rejects invalid invoice numbers %s', async invoiceNumber => {
    expect((await rename({ invoiceNumber })).code).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
