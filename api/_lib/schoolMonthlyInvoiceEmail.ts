/**
 * Monthly extra-lessons invoice → payer email with a "pay now" link, and the
 * shared "mark paid" write used by the Stripe webhook and the success page.
 * Parents of school orgs have no Tutlio account: everything they need is in
 * the email (breakdown, due date, one signed link).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolMonthlyInvoicePayUrl } from './publicLinkToken.js';

export type SchoolMonthlyInvoiceRow = {
  id: string;
  organization_id: string;
  contract_id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  unit_price_eur: number | string;
  base_lessons: number;
  base_amount_eur: number | string;
  extra_lessons: number;
  extra_amount_eur: number | string;
  total_eur: number | string;
  due_date: string | null;
  payment_status: string;
};

export type SchoolMonthlyInvoiceEmailContext = {
  /** Where this process can reach /api/send-email (local API port in dev). */
  apiOrigin: string;
  /** Browser-facing origin for the pay link. */
  publicOrigin: string;
  serviceRoleKey: string;
  student: { full_name?: string | null; email?: string | null; payer_email?: string | null; payer_name?: string | null };
  org: {
    id: string;
    name?: string | null;
    email?: string | null;
    features?: unknown;
    stripe_account_id?: string | null;
    stripe_onboarding_complete?: boolean | null;
  };
  contract: { contract_number?: string | null };
};

const LT_MONTHS_NOMINATIVE = [
  'sausis', 'vasaris', 'kovas', 'balandis', 'gegužė', 'birželis',
  'liepa', 'rugpjūtis', 'rugsėjis', 'spalis', 'lapkritis', 'gruodis',
];

/** "2026-09-01" → "2026 m. rugsėjis". */
export function monthLabelLt(periodStartYmd: string): string {
  const m = String(periodStartYmd || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return String(periodStartYmd || '');
  const month = LT_MONTHS_NOMINATIVE[Number(m[2]) - 1];
  return month ? `${m[1]} m. ${month}` : String(periodStartYmd);
}

function ltDate(ymd: string | null | undefined): string {
  const v = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v || '—';
  return v.replace(/-/g, '-');
}

export function schoolOrgContactEmail(org: SchoolMonthlyInvoiceEmailContext['org']): string {
  const features = org.features && typeof org.features === 'object' && !Array.isArray(org.features)
    ? (org.features as Record<string, unknown>)
    : {};
  return (
    (typeof features.contact_email === 'string' && features.contact_email.trim()) ||
    (typeof features.school_contract_signing_email === 'string' && features.school_contract_signing_email.trim()) ||
    String(org.email || '').trim()
  );
}

export function schoolOrgCanTakeCardPayments(org: SchoolMonthlyInvoiceEmailContext['org']): boolean {
  return Boolean(org.stripe_onboarding_complete && String(org.stripe_account_id || '').trim());
}

/** Payload for the `school_monthly_invoice` email (pure — unit-tested). */
export function buildSchoolMonthlyInvoiceEmailData(
  invoice: SchoolMonthlyInvoiceRow,
  ctx: Pick<SchoolMonthlyInvoiceEmailContext, 'publicOrigin' | 'student' | 'org' | 'contract'>,
): Record<string, unknown> {
  const cardPayments = schoolOrgCanTakeCardPayments(ctx.org);
  return {
    organizationId: ctx.org.id,
    schoolName: ctx.org.name || '',
    contactEmail: schoolOrgContactEmail(ctx.org),
    studentName: ctx.student.full_name || 'Mokinys',
    parentName: ctx.student.payer_name || '',
    recipientName: ctx.student.payer_name || ctx.student.full_name || '',
    contractNumber: ctx.contract.contract_number || '',
    invoiceId: invoice.id,
    periodLabel: monthLabelLt(invoice.period_start),
    periodStart: ltDate(invoice.period_start),
    periodEnd: ltDate(invoice.period_end),
    unitPrice: Number(invoice.unit_price_eur).toFixed(2),
    baseLessons: Number(invoice.base_lessons || 0),
    baseAmount: Number(invoice.base_amount_eur || 0).toFixed(2),
    extraLessons: Number(invoice.extra_lessons || 0),
    extraAmount: Number(invoice.extra_amount_eur || 0).toFixed(2),
    totalAmount: Number(invoice.total_eur || 0).toFixed(2),
    dueDate: ltDate(invoice.due_date),
    payUrl: cardPayments ? buildSchoolMonthlyInvoicePayUrl(ctx.publicOrigin, invoice.id) : undefined,
  };
}

export async function sendSchoolMonthlyInvoiceEmail(
  supabase: SupabaseClient,
  invoice: SchoolMonthlyInvoiceRow,
  ctx: SchoolMonthlyInvoiceEmailContext,
): Promise<{ sent: boolean; reason?: string }> {
  const to = String(ctx.student.payer_email || ctx.student.email || '').trim();
  if (!to) return { sent: false, reason: 'no payer email' };
  const data = buildSchoolMonthlyInvoiceEmailData(invoice, ctx);
  let resp: Response;
  try {
    resp = await fetch(`${ctx.apiOrigin.replace(/\/$/, '')}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': ctx.serviceRoleKey },
      body: JSON.stringify({ type: 'school_monthly_invoice', to, data }),
    });
  } catch (e) {
    return { sent: false, reason: (e as Error)?.message || 'fetch failed' };
  }
  if (!resp.ok) return { sent: false, reason: `send-email ${resp.status}` };
  // Column arrives with migration 20260905120000 — a missing column must not fail the cron.
  await supabase
    .from('school_monthly_invoices')
    .update({ invoice_email_sent_at: new Date().toISOString() })
    .eq('id', invoice.id)
    .then(({ error }) => {
      if (error) console.warn('[school-monthly-invoice] could not stamp invoice_email_sent_at', error.message);
    });
  return { sent: true };
}

/** Idempotent paid write shared by webhook, success page and (later) manual confirmation. */
export async function markSchoolMonthlyInvoicePaid(
  supabase: SupabaseClient,
  invoiceId: string,
  opts: { paidVia: 'stripe' | 'manual'; stripePaymentIntentId?: string | null },
): Promise<{ ok: true; alreadyPaid: boolean } | { ok: false; error: string }> {
  const { data: existing, error: loadErr } = await supabase
    .from('school_monthly_invoices')
    .select('id, payment_status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: 'Invoice not found' };
  if (existing.payment_status === 'paid') return { ok: true, alreadyPaid: true };

  const { error } = await supabase
    .from('school_monthly_invoices')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .neq('payment_status', 'paid');
  if (error) return { ok: false, error: error.message };

  // Optional bookkeeping columns (migration 20260905120000); ignore if not there yet.
  await supabase
    .from('school_monthly_invoices')
    .update({ paid_via: opts.paidVia, stripe_payment_intent_id: opts.stripePaymentIntentId || null })
    .eq('id', invoiceId)
    .then(({ error: e }) => {
      if (e) console.warn('[school-monthly-invoice] bookkeeping columns not written', e.message);
    });
  return { ok: true, alreadyPaid: false };
}
