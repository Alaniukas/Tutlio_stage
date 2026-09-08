import { describe, expect, it, vi } from 'vitest';
import { deliverSchoolMonthlyInvoiceOnce } from '../../api/_lib/schoolMonthlyInvoiceDelivery';

const now = new Date('2026-09-01T08:00:00Z');
const payload = { from: 'School <school@example.com>', to: ['parent@example.com'], subject: 'Invoice', html: '<p>80 EUR</p>' };
function db(initial: any = null, opts: { stampError?: boolean; missingSchema?: boolean } = {}) {
  const state = { invoice: { id: 'inv', organization_id: 'org', payment_status: 'pending', invoice_email_sent_at: null as string | null }, delivery: initial };
  return { state, client: { from(table: string) {
    let patch: any; let inserting = false; const filters: Record<string, any> = {};
    const result = () => {
      if (table === 'school_monthly_invoice_deliveries' && opts.missingSchema) return { data: null, error: { message: 'missing table' } };
      if (table === 'school_monthly_invoices' && patch && opts.stampError) return { data: null, error: { message: 'stamp unavailable' } };
      let row = table === 'school_monthly_invoices' ? state.invoice : state.delivery;
      if (row && Object.entries(filters).some(([key, value]) => row[key] !== value)) return { data: null, error: null };
      if (inserting) { state.delivery = { ...patch }; row = state.delivery; }
      else if (patch && row) Object.assign(row, patch);
      return { data: row ? { ...row } : null, error: null };
    };
    const query: any = { select: () => query, eq: (key: string, value: any) => { filters[key] = value; return query; },
      insert: (value: any) => { patch = value; inserting = true; return query; }, update: (value: any) => { patch = value; return query; },
      maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => resolve(result()) };
    return query;
  } } as any };
}
function run(client: any, send: any, override: any = {}) { return deliverSchoolMonthlyInvoiceOnce({ supabase: client, invoiceId: 'inv', organizationId: 'org', payload, send, now, ...override }); }

describe('durable invoice delivery', () => {
  it('freezes the provider payload and returns without resending once stamped', async () => {
    const database = db(); const send = vi.fn().mockResolvedValue({ id: 'email' });
    expect(await run(database.client, send)).toEqual({ sent: true, id: 'email' });
    expect(send).toHaveBeenCalledWith(payload, 'school-monthly-invoice/inv');
    expect(database.state.delivery.payload).toEqual(payload);
    expect(await run(database.client, send)).toMatchObject({ alreadySent: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('retries an uncertain request with exactly the first rendered payload and same key', async () => {
    const database = db(); const send = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'email' });
    expect(await run(database.client, send)).toMatchObject({ sent: false, reason: 'timeout' });
    expect(await run(database.client, send, { payload: { ...payload, html: 'Changed branding' } })).toMatchObject({ sent: true });
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  });
  it('does not resend after the deduplication window or for pre-migration unknown deliveries', async () => {
    const send = vi.fn();
    for (const storedPayload of [null, payload]) {
      const database = db({ id: 'inv', organization_id: 'org', payload: storedPayload, attempted_at: '2026-08-30T08:00:00Z' });
      expect(await run(database.client, send)).toMatchObject({ sent: false, reason: expect.stringContaining('requires review') });
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('repairs an invoice stamp failure from durable delivery success without sending again', async () => {
    const opts = { stampError: true }; const database = db(null, opts); const send = vi.fn().mockResolvedValue({ id: 'email' });
    expect(await run(database.client, send)).toMatchObject({ sent: false, reason: expect.stringContaining('invoice stamp failed') });
    opts.stampError = false;
    expect(await run(database.client, send)).toMatchObject({ alreadySent: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('fails closed on missing schema, wrong organization, or missing provider confirmation', async () => {
    const send = vi.fn().mockResolvedValue({});
    expect(await run(db(null, { missingSchema: true }).client, send)).toMatchObject({ sent: false });
    expect(await run(db().client, send, { organizationId: 'other-org' })).toMatchObject({ sent: false });
    expect(send).not.toHaveBeenCalled();
    expect(await run(db().client, send)).toMatchObject({ sent: false, reason: expect.stringContaining('message id') });
  });
});
