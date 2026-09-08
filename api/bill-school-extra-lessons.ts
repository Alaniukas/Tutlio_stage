import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import {
  computeExtraLessonsMonthlyBill,
  previousCalendarMonthVilnius,
  sessionMatchesExtraLessonsContract,
  sessionYmdVilnius,
} from '../src/lib/schoolExtraLessonsBilling.js';
import { wallClockToUtc } from './_lib/recurringOccurrences.js';
import { readAllSchoolBillingRows } from './_lib/schoolBillingPagination.js';
import {
  EXTRA_LESSONS_CONTRACT_KIND,
  extraLessonsServiceStartYmd,
  type ExtraLessonsOrderSnapshot,
  type StartWithin14Status,
} from '../src/lib/extraLessonsContract.js';
import { snapshotFromRow } from './_lib/extraLessonsContractShared.js';
import { sendSchoolMonthlyInvoiceEmail, type SchoolMonthlyInvoiceRow } from './_lib/schoolMonthlyInvoiceEmail.js';
import { publicAppOrigin } from './_lib/publicLinkToken.js';
import { computeCanonicalSchoolMonthlyBill, groupOccurrenceKey, hasSchoolOccurrenceEvidence, schoolContractBillingModel, schoolInvoiceDueDate } from '../src/lib/schoolCanonicalBilling.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const runStartedAt = Date.now();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const dryRun = req.query?.dryRun === 'true' || req.body?.dryRun === true;
  const requestedOrg = req.query?.organizationId ?? req.body?.organizationId;
  if (requestedOrg !== undefined && (typeof requestedOrg !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedOrg))) {
    return res.status(400).json({ error: 'Invalid organizationId' });
  }
  let { start, end } = previousCalendarMonthVilnius();
  const requestedStart = req.query?.periodStart ?? req.body?.periodStart;
  const requestedEnd = req.query?.periodEnd ?? req.body?.periodEnd;
  if (requestedStart !== undefined || requestedEnd !== undefined) {
    if (!dryRun || typeof requestedStart !== 'string' || typeof requestedEnd !== 'string'
      || !/^20\d{2}-(0[1-9]|1[0-2])-01$/.test(requestedStart)
      || !/^20\d{2}-\d{2}-\d{2}$/.test(requestedEnd)
      || requestedEnd.slice(0, 7) !== requestedStart.slice(0, 7)
      || requestedEnd < requestedStart || requestedEnd > sessionYmdVilnius(new Date().toISOString())
      || !Number.isFinite(Date.parse(`${requestedEnd}T00:00:00Z`))
      || new Date(`${requestedEnd}T00:00:00Z`).toISOString().slice(0, 10) !== requestedEnd) {
      return res.status(400).json({ error: 'Date overrides require dryRun and a valid elapsed interval within one month starting on day 1' });
    }
    start = requestedStart; end = requestedEnd;
  }
  const { data: contracts, error } = await readAllSchoolBillingRows((afterId) => {
    let query = supabase
    .from('school_contracts')
    .select('id, organization_id, student_id, class_group_id, contract_number, filled_body, unit_price_eur, base_lessons_per_month, accepted_at, withdrawal_requested_at, kind, start_within_14_status, start_within_14_days, order_snapshot, student:students(full_name, email, payer_email, payer_name), org:organizations(id, name, email, features, stripe_account_id, stripe_onboarding_complete)')
    .eq('kind', EXTRA_LESSONS_CONTRACT_KIND)
    .eq('signing_status', 'signed')
    .not('accepted_at', 'is', null)
    .order('id', { ascending: true })
    .limit(500);
    if (requestedOrg) query = query.eq('organization_id', requestedOrg);
    if (afterId) query = query.gt('id', afterId);
    return query;
  });

  if (error) return res.status(500).json({ error: error.message });
  const rows = contracts || [];
  let created = 0;
  let skipped = 0;
  let emailed = 0;
  let held = 0;
  let failed = 0;
  const review: Array<{ contract_id: string; reason: string; session_ids?: string[] }> = [];
  const sessionCache = new Map<string, { data: any[]; error: { message: string } | null }>();
  const planned: Array<Record<string, unknown>> = [];
  // Schema step 5: the invoice goes to the payer by email with a "pay now" link (no account).
  const apiOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const emailInvoice = async (invoice: SchoolMonthlyInvoiceRow, contract: any) => {
    if (invoice.invoice_email_sent_at || invoice.payment_status !== 'pending') return;
    if (!contract.student || !contract.org) { failed++; return; }
    const outcome = await sendSchoolMonthlyInvoiceEmail(supabase, invoice, {
      apiOrigin, publicOrigin: publicAppOrigin(), serviceRoleKey,
      student: contract.student, org: contract.org, contract: { contract_number: contract.contract_number || null },
    });
    if (outcome.sent) emailed++;
    else if (!outcome.alreadySent) {
      failed++;
      console.warn('[bill-school-extra-lessons] invoice delivery failed', invoice.id, outcome.reason);
    }
  };

  for (const contract of rows) {
    if (Date.now() - runStartedAt > 240_000) {
      return res.status(503).json({ success: false, error: 'billing_run_deadline', created, emailed, skipped, held, failed, review, continuation_required: true, period: { start, end } });
    }
    const model = schoolContractBillingModel(contract);
    if (model === 'review') {
      held++; review.push({ contract_id: contract.id, reason: 'unknown_frozen_contract_billing_terms' }); continue;
    }
    if (contract.withdrawal_requested_at && model === 'fixed') { skipped++; continue; }
    const unit = Number(contract.unit_price_eur || 0);
    const base = Number(contract.base_lessons_per_month || 0);
    if (!(unit > 0) || (model === 'fixed' && !(base > 0))) {
      skipped += 1;
      continue;
    }
    const { data: existing, error: existingError } = await supabase
      .from('school_monthly_invoices')
      .select('*')
      .eq('contract_id', contract.id)
      .eq('period_start', start)
      .maybeSingle();
    if (existingError) return res.status(500).json({ error: existingError.message, created, emailed });
    if (existing) {
      if (model === 'actual' && existing.billing_model !== 'actual') {
        held++; review.push({ contract_id: contract.id, reason: 'existing_invoice_uses_old_billing_model' }); continue;
      }
      if (dryRun) planned.push({ contract_id: contract.id, invoice_id: existing.id, existing: true, total_eur: existing.total_eur, billing_model: existing.billing_model || 'fixed' });
      else await emailInvoice(existing as SchoolMonthlyInvoiceRow, contract);
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
    if ((serviceStartYmd && end < serviceStartYmd) || (order?.end_date && start > order.end_date)
      || (contract.withdrawal_requested_at && contract.withdrawal_requested_at < wallClockToUtc(start, '00:00:00').toISOString())) {
      skipped += 1;
      continue;
    }
    const scope = order && { ...order, group_id: contract.class_group_id || order.group_id };
    if (!scope || !['group', 'individual'].includes(scope.service_type)
      || (scope.service_type === 'group' ? !scope.group_id : !scope.subject_id)) {
      held += 1;
      review.push({ contract_id: contract.id, reason: 'missing_contract_service_scope' });
      continue;
    }
    // Without a session→contract FK, overlapping agreements for the same service
    // cannot be allocated safely. Leave them for review instead of charging twice.
    const overlaps = rows.some((other) => {
      if (other.id === contract.id || other.student_id !== contract.student_id || other.organization_id !== contract.organization_id) return false;
      const otherOrder = snapshotFromRow(other) as ExtraLessonsOrderSnapshot | null;
      if (!otherOrder || otherOrder.service_type !== scope.service_type) return false;
      if (otherOrder.start_date > end || (otherOrder.end_date && otherOrder.end_date < start)) return false;
      if (other.withdrawal_requested_at && other.withdrawal_requested_at < wallClockToUtc(start, '00:00:00').toISOString()) return false;
      const otherServiceStart = extraLessonsServiceStartYmd({
        status: (other.start_within_14_status || (other.start_within_14_days ? 'yes' : 'no')) as StartWithin14Status,
        acceptedAtIso: other.accepted_at, order: otherOrder,
      });
      const intervalEnd = (row: typeof contract, rowOrder: ExtraLessonsOrderSnapshot) => Math.min(
        wallClockToUtc(rowOrder.end_date || end, '23:59:59').getTime() + 999,
        row.withdrawal_requested_at ? Date.parse(row.withdrawal_requested_at) : Infinity,
      );
      const overlapStart = Math.max(wallClockToUtc(serviceStartYmd || start, '00:00:00').getTime(), wallClockToUtc(otherServiceStart, '00:00:00').getTime());
      if (overlapStart >= Math.min(intervalEnd(contract, order!), intervalEnd(other, otherOrder))) return false;
      return scope.service_type === 'group'
        ? (other.class_group_id || otherOrder.group_id) === scope.group_id
        : otherOrder.subject_id === scope.subject_id;
    });
    if (overlaps) {
      held += 1;
      review.push({ contract_id: contract.id, reason: 'overlapping_service_contracts' });
      continue;
    }
    const cacheKey = `${contract.organization_id}:${model === 'actual' && scope.service_type === 'group' ? `group:${scope.group_id}` : `student:${contract.student_id}`}`;
    let loadedSessions = sessionCache.get(cacheKey);
    if (!loadedSessions) {
      loadedSessions = await readAllSchoolBillingRows((afterId) => {
      let query = supabase
      .from('sessions')
      .select('id, student_id, start_time, end_time, status, student_joined_at, tutor_joined_at, status_confirmed_at, cancelled_by, cancelled_at, cancellation_reason_code, is_complimentary, paid, payment_status, lesson_package_id, credit_applied_amount, school_billing_kind, class_group_id, subject_id, tutor:profiles!sessions_tutor_id_fkey!inner(organization_id)')
      .eq('tutor.organization_id', contract.organization_id)
      .gte('start_time', wallClockToUtc(start, '00:00:00').toISOString())
      .lte('start_time', new Date(wallClockToUtc(end, '23:59:59').getTime() + 999).toISOString())
      .order('id', { ascending: true })
      .limit(500);
      query = model === 'actual' && scope.service_type === 'group'
        ? query.eq('class_group_id', scope.group_id)
        : query.eq('student_id', contract.student_id);
      if (afterId) query = query.gt('id', afterId);
      return query;
      });
      sessionCache.set(cacheKey, loadedSessions);
    }
    const { data: sessions, error: sessionsError } = loadedSessions;
    if (sessionsError) return res.status(500).json({ error: sessionsError.message, created, emailed });

    const groupEvidence = new Set(sessions.filter(hasSchoolOccurrenceEvidence).map(groupOccurrenceKey));
    const matchingSessions = sessions.filter((session) => sessionMatchesExtraLessonsContract(session, scope)
      && (model !== 'actual' || session.student_id === contract.student_id))
      .map((session) => ({ ...session, group_occurred: Boolean(session.class_group_id) && groupEvidence.has(groupOccurrenceKey(session)) }));
    if (model === 'actual' && matchingSessions.length === 0) {
      const windowStart = serviceStartYmd && serviceStartYmd > start ? serviceStartYmd : start;
      const windowEnd = [end, order?.end_date || end, contract.withdrawal_requested_at ? sessionYmdVilnius(contract.withdrawal_requested_at) : end].sort()[0];
      const weekdays = new Set(order?.schedule_slots?.map((slot) => Number(slot.weekday)) || []);
      let hasPlannedLesson = false;
      const cursorDate = new Date(`${windowStart}T12:00:00Z`);
      while (cursorDate.toISOString().slice(0, 10) <= windowEnd) {
        if (weekdays.has(cursorDate.getUTCDay())) { hasPlannedLesson = true; break; }
        cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
      }
      if (!weekdays.size || hasPlannedLesson) {
        held++; review.push({ contract_id: contract.id, reason: 'missing_session_rows_for_scheduled_service' }); continue;
      }
    }
    const billingInput = {
      unit_price_eur: unit,
      base_lessons_per_month: base,
      period_start: start,
      period_end: end,
      sessions: matchingSessions,
      serviceStartYmd,
      serviceEndYmd: order?.end_date,
      endedAtIso: contract.withdrawal_requested_at || null,
      acceptedAtIso: contract.accepted_at,
    };
    const actualBill = model === 'actual'
      ? computeCanonicalSchoolMonthlyBill({ ...billingInput, service_type: scope.service_type as 'group' | 'individual' })
      : null;
    const bill = actualBill || computeExtraLessonsMonthlyBill(billingInput as any);
    if (actualBill?.review_session_ids.length) {
      held++; review.push({ contract_id: contract.id, reason: 'unconfirmed_session_outcomes', session_ids: actualBill.review_session_ids }); continue;
    }
    if (!(bill.total_eur > 0)) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      planned.push({ contract_id: contract.id, existing: false, billing_model: model, total_eur: bill.total_eur,
        base_lessons: bill.base_lessons, extra_lessons: bill.extra_lessons,
        billed_session_ids: actualBill?.billed_session_ids || bill.extra_session_ids });
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
      billing_model: model,
      billed_session_ids: actualBill?.billed_session_ids || [],
      payment_status: 'pending',
      due_date: model === 'actual' ? schoolInvoiceDueDate(new Date()) : due.toISOString().slice(0, 10),
    }).select('*').single();
    if (insErr || !inserted) {
      console.error('[bill-school-extra-lessons]', insErr?.message || 'insert failed');
      failed++;
      continue;
    }
    created += 1;

    await emailInvoice(inserted as SchoolMonthlyInvoiceRow, contract);
  }

  return res.status(failed ? 503 : held ? 409 : 200).json({ success: held === 0 && failed === 0, dryRun, created, emailed, skipped, held, failed, review, ...(dryRun ? { planned } : {}), period: { start, end } });
}
