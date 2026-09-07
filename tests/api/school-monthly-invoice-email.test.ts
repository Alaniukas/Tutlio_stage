import { describe, expect, it } from 'vitest';
import {
  buildSchoolMonthlyInvoiceEmailData,
  markSchoolMonthlyInvoicePaid,
  monthLabelLt,
  schoolOrgCanTakeCardPayments,
  sendSchoolMonthlyInvoiceEmail,
  type SchoolMonthlyInvoiceRow,
} from '../../api/_lib/schoolMonthlyInvoiceEmail';

process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';

const invoice: SchoolMonthlyInvoiceRow = {
  id: 'inv-1',
  organization_id: 'org1',
  contract_id: 'c1',
  student_id: 's1',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  unit_price_eur: 18,
  base_lessons: 8,
  base_amount_eur: 144,
  extra_lessons: 1,
  extra_amount_eur: 18,
  total_eur: 162,
  due_date: '2026-10-07',
  payment_status: 'pending',
};

const org = { id: 'org1', name: 'Demo Mokykla', email: 'info@demo.lt', features: { contact_email: 'irminta@demo.lt' }, stripe_account_id: 'acct_1', stripe_onboarding_complete: true };
const student = { full_name: 'Austėja Mockutė', payer_email: 'parent@example.com', payer_name: 'Tėvas' };

describe('monthLabelLt', () => {
  it('names the month in Lithuanian', () => {
    expect(monthLabelLt('2026-09-01')).toBe('2026 m. rugsėjis');
    expect(monthLabelLt('2027-01-01')).toBe('2027 m. sausis');
    expect(monthLabelLt('garbage')).toBe('garbage');
  });
});

describe('buildSchoolMonthlyInvoiceEmailData', () => {
  it('formats amounts, prefers the contact email and links the pay endpoint when Stripe is connected', () => {
    const data = buildSchoolMonthlyInvoiceEmailData(invoice, { publicOrigin: 'https://tutlio.lt', student, org, contract: { contract_number: 'PP-1' } });
    expect(data).toMatchObject({
      organizationId: 'org1',
      contactEmail: 'irminta@demo.lt',
      studentName: 'Austėja Mockutė',
      periodLabel: '2026 m. rugsėjis',
      unitPrice: '18.00',
      baseLessons: 8,
      baseAmount: '144.00',
      extraLessons: 1,
      extraAmount: '18.00',
      totalAmount: '162.00',
      dueDate: '2026-10-07',
    });
    expect(String(data.payUrl)).toMatch(/^https:\/\/tutlio\.lt\/api\/pay-school-monthly-invoice\?invoice=inv-1&t=[a-f0-9]{40}$/);
  });

  it('omits the pay link for schools without Stripe Connect', () => {
    const noStripe = { ...org, stripe_account_id: null, stripe_onboarding_complete: false };
    expect(schoolOrgCanTakeCardPayments(noStripe)).toBe(false);
    const data = buildSchoolMonthlyInvoiceEmailData(invoice, { publicOrigin: 'https://tutlio.lt', student, org: noStripe, contract: {} });
    expect(data.payUrl).toBeUndefined();
  });
});

function fakeSupabase(state: { status: string }) {
  const updates: Array<Record<string, unknown>> = [];
  const builder = () => {
    let patch: Record<string, unknown> | null = null;
    const api: any = {
      select: () => api,
      eq: () => api,
      neq: () => api,
      update: (p: Record<string, unknown>) => { patch = p; return api; },
      maybeSingle: async () => ({ data: { id: 'inv-1', payment_status: state.status }, error: null }),
      then: (resolve: (v: any) => unknown) => {
        if (patch) { updates.push(patch); if (patch.payment_status === 'paid') state.status = 'paid'; }
        return resolve({ error: null });
      },
    };
    return api;
  };
  return { client: { from: builder } as any, updates };
}

describe('sendSchoolMonthlyInvoiceEmail', () => {
  it('posts the email to send-email with the internal key and stamps the invoice', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200 } as Response;
    }) as any;
    try {
      const db = fakeSupabase({ status: 'pending' });
      const result = await sendSchoolMonthlyInvoiceEmail(db.client, invoice, {
        apiOrigin: 'http://127.0.0.1:3002', publicOrigin: 'https://tutlio.lt', serviceRoleKey: 'service-key-test',
        student, org, contract: { contract_number: 'PP-1' },
      });
      expect(result.sent).toBe(true);
      expect(calls[0].url).toBe('http://127.0.0.1:3002/api/send-email');
      expect(calls[0].body.type).toBe('school_monthly_invoice');
      expect(calls[0].body.to).toBe('parent@example.com');
      expect(db.updates[0]).toHaveProperty('invoice_email_sent_at');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('skips when the student has no payer email', async () => {
    const db = fakeSupabase({ status: 'pending' });
    const result = await sendSchoolMonthlyInvoiceEmail(db.client, invoice, {
      apiOrigin: 'x', publicOrigin: 'x', serviceRoleKey: 'k', student: { full_name: 'A' }, org, contract: {},
    });
    expect(result).toEqual({ sent: false, reason: 'no payer email' });
  });
});

describe('markSchoolMonthlyInvoicePaid', () => {
  it('marks a pending invoice paid once and reports repeats as already paid', async () => {
    const db = fakeSupabase({ status: 'pending' });
    expect(await markSchoolMonthlyInvoicePaid(db.client, 'inv-1', { paidVia: 'stripe', stripePaymentIntentId: 'pi_1' })).toEqual({ ok: true, alreadyPaid: false });
    expect(db.updates[0]).toMatchObject({ payment_status: 'paid' });
    expect(db.updates[1]).toMatchObject({ paid_via: 'stripe', stripe_payment_intent_id: 'pi_1' });
    expect(await markSchoolMonthlyInvoicePaid(db.client, 'inv-1', { paidVia: 'stripe' })).toEqual({ ok: true, alreadyPaid: true });
  });
});
