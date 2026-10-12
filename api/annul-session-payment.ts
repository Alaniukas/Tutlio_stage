// Pro Klasė admin: waive an unbilled client charge without deleting tutor pay evidence.
import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

function failure(res: VercelResponse, status: number, code: string) {
  return res.status(status).json({ code });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return failure(res, 405, 'notAllowed');
  try {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return failure(res, 503, 'failed');
    const supabase = createClient(url, key, supabaseServiceRoleClientOptions());
    const access = await requireOrgAdminAccess(req, supabase, 'sessions.edit');
    if (access.ok === false) return failure(res, access.status, 'notAllowed');
    const orgId = access.access.organizationId;
    if (!isProKlaseOrg(orgId)) return failure(res, 403, 'notAllowed');
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!sessionId) return failure(res, 400, 'notAllowed');

    const { data: session, error: loadError } = await supabase.from('sessions')
      .select('id, tutor_id, student_id, status, paid, payment_status, is_complimentary, lesson_package_id, payment_batch_id, stripe_checkout_session_id, class_group_id, school_billing_kind')
      .eq('id', sessionId).maybeSingle();
    if (loadError) throw loadError;
    if (!session) return failure(res, 404, 'notAllowed');
    const { data: tutor, error: tutorError } = await supabase.from('profiles')
      .select('organization_id').eq('id', session.tutor_id).maybeSingle();
    if (tutorError) throw tutorError;
    if (tutor?.organization_id !== orgId) return failure(res, 403, 'notAllowed');
    if (!['active', 'completed', 'no_show'].includes(session.status)
      || session.class_group_id || session.school_billing_kind) return failure(res, 409, 'notAllowed');
    // A retry is harmless, including after the first response was lost.
    if (session.is_complimentary) return res.status(200).json({ session });
    if (session.paid || session.payment_status === 'paid') return failure(res, 409, 'paid');
    if (session.lesson_package_id || session.payment_batch_id) return failure(res, 409, 'billed');
    if (session.stripe_checkout_session_id) return failure(res, 409, 'checkout');

    // Salary invoices must stay intact. Only existing client billing blocks this action.
    const checks = await Promise.all([
      supabase.from('invoice_line_items').select('invoices!inner(status, pdf_meta, organization_id)')
        .contains('session_ids', [sessionId]).eq('invoices.organization_id', orgId).neq('invoices.status', 'cancelled'),
      supabase.from('invoices').select('pdf_meta').eq('source_session_id', sessionId)
        .eq('organization_id', orgId).neq('status', 'cancelled'),
      supabase.from('pooled_package_quotes').select('lesson_packages!inner(payment_status)')
        .contains('session_ids', [sessionId]),
      supabase.from('payments').select('session_id').eq('session_id', sessionId).limit(1),
    ]);
    for (const check of checks) if (check.error) throw check.error;
    const [lines, invoices, quotes, payments] = checks;
    const customerInvoice = (invoice: any) => invoice?.pdf_meta?.invoiceKind !== 'tutor_pay';
    const related = (value: any): any[] => Array.isArray(value) ? value : value ? [value] : [];
    if (lines.data?.some(row => related(row.invoices).some(customerInvoice))
      || invoices.data?.some(customerInvoice)
      || quotes.data?.some(row => related(row.lesson_packages).some(pkg => pkg.payment_status !== 'cancelled'))
      || payments.data?.length) return failure(res, 409, 'billed');

    // Do not overwrite a concurrently collected payment, package assignment or reassignment.
    let save = supabase.from('sessions')
      .update({ is_complimentary: true, paid: true, payment_status: 'paid' })
      .eq('id', sessionId).eq('tutor_id', session.tutor_id).eq('status', session.status)
      .eq('is_complimentary', false).is('lesson_package_id', null).is('payment_batch_id', null)
      .is('stripe_checkout_session_id', null).is('class_group_id', null).is('school_billing_kind', null);
    save = session.student_id == null ? save.is('student_id', null) : save.eq('student_id', session.student_id);
    save = session.paid == null ? save.is('paid', null) : save.eq('paid', false);
    save = session.payment_status == null ? save.is('payment_status', null) : save.eq('payment_status', session.payment_status);
    const { data: saved, error: saveError } = await save
      .select('id, paid, payment_status, is_complimentary').maybeSingle();
    if (saveError) throw saveError;
    if (!saved) return failure(res, 409, 'changed');
    return res.status(200).json({ session: saved });
  } catch (error) {
    console.error('[annul-session-payment]', error instanceof Error ? error.message : 'Payment annulment failed');
    return failure(res, 503, 'failed');
  }
}
