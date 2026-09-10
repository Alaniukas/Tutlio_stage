import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { readAllSchoolBillingRows } from './_lib/schoolBillingPagination.js';
import { sendSchoolMonthlyInvoiceEmail } from './_lib/schoolMonthlyInvoiceEmail.js';
import { SCHOOL_INVOICE_RETRY_WINDOW_MS } from './_lib/schoolMonthlyInvoiceDelivery.js';
import { publicAppOrigin } from './_lib/publicLinkToken.js';
import { schoolContractBillingModel } from '../src/lib/schoolCanonicalBilling.js';

/** Hourly outbox retry; never creates or recalculates an invoice. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronAuth(req, res)) return;
  const started = Date.now();
  const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: rows, error } = await readAllSchoolBillingRows((after) => {
    let query = supabase.from('school_monthly_invoices').select('*, student:students(full_name,email,payer_email,payer_name), org:organizations(id,name,email,features,stripe_account_id,stripe_onboarding_complete), contract:school_contracts(contract_number,filled_body,order_snapshot), delivery:school_monthly_invoice_deliveries(id,attempted_at,sent_at,payload)')
      .eq('payment_status', 'pending').is('invoice_email_sent_at', null).order('id').limit(500);
    if (after) query = query.gt('id', after);
    return query;
  });
  if (error) return res.status(503).json({ error: error.message });
  let held = 0, failed = 0, emailed = 0, cursor = 0;
  const ready = rows.filter((row: any) => {
    const contract = Array.isArray(row.contract) ? row.contract[0] : row.contract;
    const model = schoolContractBillingModel({ organization_id: row.organization_id, filled_body: contract?.filled_body, order_snapshot: contract?.order_snapshot });
    if (model === 'review' || (model === 'actual' && row.billing_model !== 'actual')) { held++; return false; }
    const delivery = Array.isArray(row.delivery) ? row.delivery[0] : row.delivery;
    // Old uncertain sends must be reconciled, not replayed after provider dedup expires.
    if (delivery && !delivery.sent_at && (!delivery.payload || started - Date.parse(delivery.attempted_at) >= SCHOOL_INVOICE_RETRY_WINDOW_MS)) {
      held++; return false;
    }
    return true;
  });
  const apiOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < ready.length && Date.now() - started < 60_000) {
      const row: any = ready[cursor++];
      if (!row.student || !row.org) { failed++; continue; }
      const result = await sendSchoolMonthlyInvoiceEmail(supabase, row, {
        apiOrigin, publicOrigin: publicAppOrigin(), serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        student: row.student, org: row.org, contract: row.contract || {},
      });
      if (result.sent) emailed++;
      else if (!result.alreadySent) { failed++; console.warn('[retry-school-monthly-invoice-emails]', row.id, result.reason); }
    }
  }));
  const deferred = ready.length - cursor;
  return res.status(failed || deferred ? 503 : held ? 409 : 200).json({ success: !failed && !held && !deferred, emailed, failed, held, deferred });
}
