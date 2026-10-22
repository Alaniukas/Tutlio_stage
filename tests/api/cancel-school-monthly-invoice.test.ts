import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({
  access: vi.fn(), retrieve: vi.fn(), expire: vi.fn(),
  tables: {} as Record<string, any[]>, logs: [] as RowQueryLog[], writes: [] as any[],
  race: null as Record<string, unknown> | null, writeError: false,
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: state.access }));
vi.mock('../../api/_lib/schoolConsultationsAccess.js', () => ({ serviceSupabase: () => ({ from: (table: string) => {
  const query = rowQuery(table, name => state.tables[name] || [], state.logs, state.writes);
  const log = state.logs.at(-1)!;
  const update = query.update;
  query.update = (patch: any) => {
    if (state.race) Object.assign(state.tables[table][0], state.race);
    return update(patch);
  };
  const then = query.then;
  query.then = (resolve: any, reject: any) => then((result: any) => {
    if (log.operation === 'update') {
      if (state.writeError) return resolve({ data: null, error: { message: 'private database error' } });
      if (result.data) state.tables[table] = state.tables[table].map(row => row.id === result.data.id ? result.data : row);
    }
    return resolve(result);
  }, reject);
  return query;
} }) }));
vi.mock('stripe', () => ({ default: class {
  checkout = { sessions: { retrieve: state.retrieve, expire: state.expire } };
} }));

import handler from '../../api/cancel-school-monthly-invoice';

const invoiceId = 'c3a00000-7e57-4000-8000-000000000827';
beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'test-only');
  state.logs = []; state.writes = []; state.race = null; state.writeError = false;
  state.access.mockReset().mockResolvedValue({ ok: true, access: { organizationId: 'school', userId: 'admin' } });
  state.tables = { school_monthly_invoices: [{ id: invoiceId, organization_id: 'school', invoice_number: 'PAM-827',
    payment_status: 'pending', total_eur: 18, paid_at: null, stripe_payment_intent_id: null, stripe_checkout_session_id: null,
    pdf_path: 'original.pdf', billed_session_ids: ['lesson'], credit_applied_eur: 0,
    org: { entity_type: 'school', stripe_account_id: 'acct_school' } }],
    sessions: [{ id: 'lesson', status: 'completed' }] };
  state.retrieve.mockReset().mockResolvedValue({ id: 'cs_test', status: 'open', payment_status: 'unpaid',
    metadata: { tutlio_school_monthly_invoice_id: invoiceId } });
  state.expire.mockReset().mockResolvedValue({ status: 'expired' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function request(body: any = {}, method = 'POST') {
  const response: any = { code: 0, body: null, setHeader: vi.fn(),
    status(code: number) { response.code = code; return response; },
    json(value: any) { response.body = value; return response; } };
  await handler({ method, body: { invoiceId, reason: 'Testinė sąskaita', ...body } } as any, response);
  return response;
}

describe('school invoice cancellation', () => {
  it.each([401, 403])('requires a live administrator with finance.edit (%s)', async status => {
    state.access.mockResolvedValue({ ok: false, status, error: 'Denied' });
    expect((await request()).code).toBe(status);
    expect(state.access.mock.calls[0][2]).toBe('finance.edit');
    expect(state.logs).toEqual([]);
  });
  it.each([{ organization_id: 'foreign' }, { org: { entity_type: 'company' } }])('rejects out-of-scope invoices %j', async patch => {
    Object.assign(state.tables.school_monthly_invoices[0], patch);
    expect((await request({ organizationId: 'foreign' })).code).toBe(404);
    expect(state.writes).toEqual([]);
  });
  it('voids an unpaid document with an audit reason, keeping the number, PDF, lessons and amount', async () => {
    const response = await request();
    expect(response.code).toBe(200);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(state.tables.school_monthly_invoices[0]).toMatchObject({ invoice_number: 'PAM-827', payment_status: 'cancelled',
      total_eur: 18, pdf_path: 'original.pdf', billed_session_ids: ['lesson'], cancelled_by: 'admin',
      cancelled_at: expect.any(String), cancellation_reason: 'Testinė sąskaita' });
    expect(state.tables.sessions).toEqual([{ id: 'lesson', status: 'completed' }]);
    expect(state.writes).toHaveLength(1);
    expect(state.retrieve).not.toHaveBeenCalled();
    const retry = await request({ reason: 'Different retry reason' });
    expect(retry.body).toMatchObject({ alreadyCancelled: true, cancellationReason: 'Testinė sąskaita' });
    expect(state.writes).toHaveLength(1);
  });
  it.each([{ payment_status: 'paid' }, { paid_at: '2026-10-01T12:00:00Z' }, { stripe_payment_intent_id: 'pi_paid' }])(
    'preserves paid documents %j', async patch => {
      Object.assign(state.tables.school_monthly_invoices[0], patch);
      expect((await request()).code).toBe(409);
      expect(state.writes).toEqual([]);
    });
  it('expires a connected checkout before changing the invoice', async () => {
    state.tables.school_monthly_invoices[0].stripe_checkout_session_id = 'cs_test';
    state.expire.mockImplementation(async () => {
      expect(state.writes).toEqual([]);
      return { status: 'expired' };
    });
    expect((await request()).code).toBe(200);
    expect(state.retrieve).toHaveBeenCalledWith('cs_test', { stripeAccount: 'acct_school' });
    expect(state.expire).toHaveBeenCalledWith('cs_test', { stripeAccount: 'acct_school' });
  });
  it.each([{ payment_status: 'paid', status: 'complete' }, { status: 'complete', payment_status: 'unpaid' },
    { metadata: { tutlio_school_monthly_invoice_id: 'foreign' } }])('does not cancel a settled or unrelated checkout %j', async patch => {
      state.tables.school_monthly_invoices[0].stripe_checkout_session_id = 'cs_test';
      state.retrieve.mockResolvedValue({ status: 'open', payment_status: 'unpaid',
        metadata: { tutlio_school_monthly_invoice_id: invoiceId }, ...patch });
      expect((await request()).code).toBe(409);
      expect(state.expire).not.toHaveBeenCalled();
      expect(state.writes).toEqual([]);
    });
  it('does not change the invoice when checkout expiration fails', async () => {
    state.tables.school_monthly_invoices[0].stripe_checkout_session_id = 'cs_test';
    state.expire.mockRejectedValue(new Error('private provider failure'));
    const response = await request();
    expect(response.code).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private provider');
    expect(state.writes).toEqual([]);
    expect(state.tables.school_monthly_invoices[0].payment_status).toBe('pending');
  });
  it.each([{ payment_status: 'paid' }, { stripe_checkout_session_id: 'cs_new' }])('rejects concurrent changes %j', async patch => {
    state.race = patch;
    expect((await request()).code).toBe(409);
    expect(state.tables.school_monthly_invoices[0].cancelled_at).toBeUndefined();
  });
  it('returns a save failure without claiming the invoice was cancelled', async () => {
    state.writeError = true;
    const response = await request();
    expect(response.code).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private database');
    expect(state.tables.school_monthly_invoices[0].payment_status).toBe('pending');
  });
  it('validates the reason, identifier and method before mutations', async () => {
    for (const body of [{ reason: '  ' }, { reason: 'x' }, { reason: 'x'.repeat(1001) }, { invoiceId: 'bad' }]) {
      expect((await request(body)).code).toBe(400);
    }
    expect((await request({}, 'GET')).code).toBe(405);
    expect(state.writes).toEqual([]);
  });
});
