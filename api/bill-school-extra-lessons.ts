import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import {
  computeExtraLessonsMonthlyBill,
  previousCalendarMonthVilnius,
} from '../src/lib/schoolExtraLessonsBilling.js';
import {
  EXTRA_LESSONS_CONTRACT_KIND,
  extraLessonsServiceStartYmd,
  type ExtraLessonsOrderSnapshot,
  type StartWithin14Status,
} from '../src/lib/extraLessonsContract.js';
import { snapshotFromRow } from './_lib/extraLessonsContractShared.js';
import { sendSchoolMonthlyInvoiceEmail, type SchoolMonthlyInvoiceRow } from './_lib/schoolMonthlyInvoiceEmail.js';
import { publicAppOrigin } from './_lib/publicLinkToken.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { start, end } = previousCalendarMonthVilnius();
  const { data: contracts, error } = await supabase
    .from('school_contracts')
    .select('id, organization_id, student_id, contract_number, unit_price_eur, base_lessons_per_month, accepted_at, withdrawal_requested_at, kind, start_within_14_status, start_within_14_days, order_snapshot, student:students(full_name, email, payer_email, payer_name), org:organizations(id, name, email, features, stripe_account_id, stripe_onboarding_complete)')
    .eq('kind', EXTRA_LESSONS_CONTRACT_KIND)
    .eq('signing_status', 'signed')
    .not('accepted_at', 'is', null)
    .is('withdrawal_requested_at', null);

  if (error) return res.status(500).json({ error: error.message });
  const rows = contracts || [];
  let created = 0;
  let skipped = 0;
  let emailed = 0;
  // Schema step 5: the invoice goes to the payer by email with a "pay now" link (no account).
  const apiOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  for (const contract of rows) {
    const unit = Number(contract.unit_price_eur || 0);
    const base = Number(contract.base_lessons_per_month || 0);
    if (!(unit > 0) || !(base > 0)) {
      skipped += 1;
      continue;
    }
    const { data: existing } = await supabase
      .from('school_monthly_invoices')
      .select('id')
      .eq('contract_id', contract.id)
      .eq('period_start', start)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const order = snapshotFromRow(contract) as ExtraLessonsOrderSnapshot | null;
    const serviceStartYmd = contract.accepted_at && order
      ? extraLessonsServiceStartYmd({
        status: (contract.start_within_14_status || (contract.start_within_14_days ? 'yes' : 'no')) as StartWithin14Status,
        acceptedAtIso: contract.accepted_at,
        order,
      })
      : null;
    if (serviceStartYmd && end < serviceStartYmd) {
      skipped += 1;
      continue;
    }

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, start_time, status, student_joined_at, school_billing_kind')
      .eq('student_id', contract.student_id)
      .gte('start_time', `${start}T00:00:00.000Z`)
      .lte('start_time', `${end}T23:59:59.999Z`);

    const bill = computeExtraLessonsMonthlyBill({
      unit_price_eur: unit,
      base_lessons_per_month: base,
      period_start: start,
      period_end: end,
      sessions: (sessions || []) as any,
      serviceStartYmd,
      endedAtIso: contract.withdrawal_requested_at || null,
    });
    if (!(bill.total_eur > 0)) {
      skipped += 1;
      continue;
    }

    const due = new Date(`${end}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 7);

    const { data: inserted, error: insErr } = await supabase.from('school_monthly_invoices').insert({
      organization_id: contract.organization_id,
      contract_id: contract.id,
      student_id: contract.student_id,
      period_start: start,
      period_end: end,
      unit_price_eur: bill.unit_price_eur,
      base_lessons: bill.base_lessons,
      base_amount_eur: bill.base_amount_eur,
      extra_lessons: bill.extra_lessons,
      extra_amount_eur: bill.extra_amount_eur,
      total_eur: bill.total_eur,
      extra_session_ids: bill.extra_session_ids,
      payment_status: 'pending',
      due_date: due.toISOString().slice(0, 10),
    }).select('*').single();
    if (insErr || !inserted) {
      console.error('[bill-school-extra-lessons]', insErr?.message || 'insert failed');
      continue;
    }
    created += 1;

    const studentRow = (contract as any).student as { full_name?: string | null; email?: string | null; payer_email?: string | null; payer_name?: string | null } | null;
    const orgRow = (contract as any).org as { id: string; name?: string | null; email?: string | null; features?: unknown; stripe_account_id?: string | null; stripe_onboarding_complete?: boolean | null } | null;
    if (studentRow && orgRow) {
      const outcome = await sendSchoolMonthlyInvoiceEmail(supabase, inserted as SchoolMonthlyInvoiceRow, {
        apiOrigin,
        publicOrigin: publicAppOrigin(),
        serviceRoleKey,
        student: studentRow,
        org: orgRow,
        contract: { contract_number: (contract as any).contract_number || null },
      });
      if (outcome.sent) emailed += 1;
      else console.warn('[bill-school-extra-lessons] invoice email not sent', inserted.id, outcome.reason);
    }
  }

  return res.status(200).json({ success: true, created, emailed, skipped, period: { start, end } });
}
