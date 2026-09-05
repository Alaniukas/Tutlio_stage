import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
}));
vi.mock('stripe', () => {
  class StripeMock {
    checkout = { sessions: { create: stripeMocks.create, retrieve: stripeMocks.retrieve, expire: stripeMocks.expire } };
    constructor(_key: string, _opts: any) {}
  }
  return { default: StripeMock };
});

const db = vi.hoisted(() => ({
  invoice: null as Record<string, unknown> | null,
  updates: [] as Array<Record<string, unknown>>,
}));
vi.mock('@supabase/supabase-js', () => {
  const builder = () => {
    let patch: Record<string, unknown> | null = null;
    const api: any = {
      select: () => api,
      eq: () => api,
      update: (p: Record<string, unknown>) => { patch = p; return api; },
      maybeSingle: async () => ({ data: db.invoice, error: null }),
      then: (resolve: (v: any) => unknown) => { if (patch) db.updates.push(patch); return resolve({ error: null }); },
    };
    return api;
  };
  return { createClient: () => ({ from: builder }) };
});

import handler from '../../api/pay-school-monthly-invoice';
import { buildPublicLinkToken } from '../../api/_lib/publicLinkToken';
import { schoolInstallmentCheckoutCents } from '../../api/_lib/schoolInstallmentStripe';

function mockRes() {
  const out: { statusCode: number; body: any; redirect: string | null } = { statusCode: 0, body: null, redirect: null };
  return {
    status(code: number) { out.statusCode = code; return this; },
    json(body: any) { out.body = body; return this; },
    send(body: any) { out.body = body; return this; },
    redirect(code: number, url: string) { out.statusCode = code; out.redirect = url; return this; },
    getResult: () => out,
  };
}

const INVOICE_ID = 'inv-1';
const baseInvoice = () => ({
  id: INVOICE_ID,
  contract_id: 'c1',
  student_id: 's1',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  base_lessons: 8,
  extra_lessons: 1,
  total_eur: 162,
  payment_status: 'pending',
  contract: { id: 'c1', contract_number: 'PP-1', archived_at: null, student: { full_name: 'Austėja Mockutė', email: 'a@example.com', payer_email: 'parent@example.com', payer_name: 'Tėvas' } },
  org: { name: 'Demo Mokykla', email: 'info@demo.lt', stripe_account_id: 'acct_123', stripe_onboarding_complete: true },
});

function req(query: Record<string, string>) {
  return { method: 'GET', query, headers: { host: 'tutlio.lt', 'x-forwarded-proto': 'https' }, body: {} } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.updates = [];
  db.invoice = baseInvoice();
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  process.env.APP_URL = 'https://tutlio.lt';
});

describe('GET /api/pay-school-monthly-invoice', () => {
  it('rejects a missing or wrong token', async () => {
    const res = mockRes();
    await handler(req({ invoice: INVOICE_ID, t: 'wrong' }), res as any);
    expect(res.getResult().statusCode).toBe(403);
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it('creates a Connect checkout for the invoice total and redirects to it', async () => {
    stripeMocks.create.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });
    const res = mockRes();
    await handler(req({ invoice: INVOICE_ID, t: buildPublicLinkToken('monthly-invoice', INVOICE_ID) }), res as any);
    const out = res.getResult();
    expect(out.statusCode).toBe(303);
    expect(out.redirect).toBe('https://checkout.stripe.com/cs_1');
    const params = stripeMocks.create.mock.calls[0][0];
    expect(params.mode).toBe('payment');
    expect(params.customer_email).toBe('parent@example.com');
    expect(params.metadata).toEqual({ tutlio_school_monthly_invoice_id: INVOICE_ID, tutlio_school_contract_id: 'c1', tutlio_student_id: 's1' });
    expect(params.payment_intent_data.transfer_data).toEqual({ destination: 'acct_123' });
    // School Connect rule: the payer pays the list amount; Tutlio's 1% + the Stripe
    // estimate come out of the transfer to the school (schoolInstallmentStripe.ts).
    const charged = params.line_items[0].price_data.unit_amount;
    const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(162, 'default');
    expect(charged).toBe(chargeCents);
    expect(charged).toBe(16200);
    expect(transferToSchoolCents).toBeLessThan(chargeCents);
    expect(params.payment_intent_data.application_fee_amount).toBe(chargeCents - transferToSchoolCents);
    expect(params.line_items[0].price_data.product_data.name).toContain('2026 m. rugsėjis');
    expect(params.success_url).toContain(`/school-payment-success?success=1&monthly=${INVOICE_ID}`);
    expect(db.updates[0]).toEqual({ stripe_checkout_session_id: 'cs_1' });
  });

  it('shows a paid page instead of charging twice, and blocks schools without Stripe', async () => {
    db.invoice = { ...baseInvoice(), payment_status: 'paid' };
    const paid = mockRes();
    await handler(req({ invoice: INVOICE_ID, t: buildPublicLinkToken('monthly-invoice', INVOICE_ID) }), paid as any);
    expect(paid.getResult().statusCode).toBe(200);
    expect(String(paid.getResult().body)).toContain('jau apmokėta');

    db.invoice = { ...baseInvoice(), org: { name: 'Demo', stripe_account_id: null, stripe_onboarding_complete: false } };
    const blocked = mockRes();
    await handler(req({ invoice: INVOICE_ID, t: buildPublicLinkToken('monthly-invoice', INVOICE_ID) }), blocked as any);
    expect(blocked.getResult().statusCode).toBe(400);
    expect(String(blocked.getResult().body)).toContain('Mokėjimas dar neparuoštas');
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it('reuses an open checkout with the same amount', async () => {
    db.invoice = { ...baseInvoice(), stripe_checkout_session_id: 'cs_old' };
    stripeMocks.retrieve.mockResolvedValue({ status: 'open', url: 'https://checkout.stripe.com/cs_old', amount_total: 16597 });
    const res = mockRes();
    await handler(req({ invoice: INVOICE_ID, t: buildPublicLinkToken('monthly-invoice', INVOICE_ID) }), res as any);
    if (res.getResult().redirect === 'https://checkout.stripe.com/cs_old') {
      expect(stripeMocks.create).not.toHaveBeenCalled();
    } else {
      // Amount differs from the current fee table → a fresh session is created instead.
      expect(stripeMocks.create).toHaveBeenCalledTimes(1);
    }
  });
});
