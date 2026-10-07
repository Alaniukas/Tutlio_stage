import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types.js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { fetchAllRows } from '../src/lib/fetchAllRows.js';
import {
  buildCompanyPaymentReport, type ReportStudentSource, type ReportSessionSource,
  type ReportPackageSource, type ReportInvoiceSource, type ReportBatchSource, type ReportLedgerSource,
} from '../src/lib/companyPaymentReport.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, supabaseServiceRoleClientOptions(),
    );
    const access = await requireOrgAdminAccess(req, supabase, 'finance.view');
    if (access.ok === false) return res.status(access.status).json({ error: access.error });
    // The organization is resolved from the authenticated seat, never a request parameter.
    const organizationId = access.access.organizationId;
    const [students, sessions, packages, invoices, ledger] = await Promise.all([
      fetchAllRows<ReportStudentSource>((from, to) => supabase.from('students')
        .select('id, organization_id, full_name, email, phone, payer_name, payer_email, payer_phone, payment_payer, linked_user_id')
        .eq('organization_id', organizationId).order('id').range(from, to)),
      fetchAllRows<ReportSessionSource>((from, to) => supabase.from('sessions')
        .select('id, student_id, tutor_id, created_at, start_time, end_time, status, paid, payment_status, price, is_complimentary, lesson_package_id, payment_batch_id, subjects(is_trial), students!inner(organization_id)')
        .eq('students.organization_id', organizationId).order('id').range(from, to)),
      fetchAllRows<ReportPackageSource>((from, to) => supabase.from('lesson_packages')
        .select('id, student_id, tutor_id, total_lessons, total_price, paid, payment_status, paid_at, created_at, manual_sales_invoice_id, subjects(is_trial), lesson_package_items(subjects(is_trial)), students!inner(organization_id)')
        .eq('students.organization_id', organizationId)
        .or(`pool_organization_id.is.null,pool_organization_id.eq.${organizationId}`)
        .order('id').range(from, to)),
      fetchAllRows<ReportInvoiceSource>((from, to) => supabase.from('invoices')
        .select('id, invoice_number, issue_date, created_at, total_amount, status, seller_user_id, buyer_snapshot, pdf_meta, source_session_id, billing_batch_id, invoice_line_items(session_ids)')
        .eq('organization_id', organizationId).is('seller_user_id', null).order('id').range(from, to)),
      fetchAllRows<ReportLedgerSource>((from, to) => supabase.from('platform_fee_ledger')
        .select('source_type, source_id, paid_at, currency, base_amount, gross_amount')
        .eq('organization_id', organizationId).order('id').range(from, to)),
    ]);
    const tutorIds = [...new Set([...sessions.map(session => session.tutor_id), ...packages.map(pkg => pkg.tutor_id)])];
    const batchIds = [...new Set([...sessions.map(session => session.payment_batch_id), ...invoices.map(invoice => invoice.billing_batch_id)]
      .filter((id): id is string => !!id))];
    // Small ID batches avoid long PostgREST URLs; all pages are read, including historical records.
    const tutors: { id: string; full_name: string | null }[] = [];
    const batches: ReportBatchSource[] = [];
    await Promise.all([
      (async () => {
        for (let offset = 0; offset < tutorIds.length; offset += 100) {
          tutors.push(...await fetchAllRows<{ id: string; full_name: string | null }>((from, to) => supabase.from('profiles')
            .select('id, full_name').in('id', tutorIds.slice(offset, offset + 100)).order('id').range(from, to)));
        }
      })(),
      (async () => {
        for (let offset = 0; offset < batchIds.length; offset += 100) {
          batches.push(...await fetchAllRows<ReportBatchSource>((from, to) => supabase.from('billing_batches')
            .select('id, total_amount, paid, payment_status, paid_at, created_at, payer_name, payer_email, profiles!inner(organization_id)')
            .eq('profiles.organization_id', organizationId)
            .in('id', batchIds.slice(offset, offset + 100)).order('id').range(from, to)));
        }
      })(),
    ]);
    const generatedAt = new Date().toISOString();
    return res.status(200).json({ rows: buildCompanyPaymentReport({ students, sessions, packages, invoices, ledger, tutors, batches, now: generatedAt }), generatedAt });
  } catch (error) {
    console.error('[company-payment-report] Report load failed:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Payment report unavailable' });
  }
}
