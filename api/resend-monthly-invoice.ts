// POST /api/resend-monthly-invoice
// Body: { billingBatchId }
//
// Tutor (owner) or org admin re-sends the unpaid monthly invoice email
// with a stable /api/pay-invoice link (and S.F. PDF when available).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import {
  tutorUsesManualStudentPayments,
  trimManualPaymentBankDetails,
} from './_lib/soloManualStudentPayments.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });

  const { billingBatchId } = (req.body || {}) as { billingBatchId?: string };
  if (!billingBatchId) return json(res, 400, { error: 'Missing billingBatchId' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const appOrigin = publicOriginFromRequest(req);

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) return json(res, 401, { error: 'Unauthorized' });
    const userId = authData.user.id;

    const { data: batch, error: batchErr } = await supabase
      .from('billing_batches')
      .select(`
        id, tutor_id, period_start_date, period_end_date, total_amount, paid, payment_status,
        payer_email, payer_name, payment_deadline_date,
        profiles!billing_batches_tutor_id_fkey(
          id, full_name, organization_id, enable_manual_student_payments, manual_payment_bank_details,
          subscription_plan, manual_subscription_exempt
        )
      `)
      .eq('id', billingBatchId)
      .maybeSingle();

    if (batchErr || !batch) return json(res, 404, { error: 'Sąskaita nerasta' });

    const tutor = batch.profiles as any;
    if (!tutor) return json(res, 404, { error: 'Korepetitorius nerastas' });

    const isOwner = batch.tutor_id === userId;
    let isOrgAdmin = false;
    if (!isOwner && tutor.organization_id) {
      const adminRow = await getOrgAdminAccessByUserId(supabase, userId);
      isOrgAdmin = Boolean(
        adminRow
        && adminRow.organizationId === tutor.organization_id
        && hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'finance.edit'),
      );
    }
    if (!isOwner && !isOrgAdmin) {
      return json(res, 403, { error: 'Neturite teisės siųsti šios sąskaitos priminimo' });
    }

    if (batch.paid || batch.payment_status === 'paid') {
      return json(res, 400, { error: 'Sąskaita jau apmokėta' });
    }
    if (batch.payment_status === 'cancelled') {
      return json(res, 400, { error: 'Sąskaita atšaukta' });
    }

    const toEmail = String(batch.payer_email || '').trim();
    if (!toEmail) return json(res, 400, { error: 'Nėra mokėtojo el. pašto' });

    const { data: junction } = await supabase
      .from('billing_batch_sessions')
      .select('session_id, sessions(id, start_time, price, subjects(name), students(full_name))')
      .eq('billing_batch_id', batch.id);

    const sessionsForEmail = (junction || [])
      .map((row: any) => row.sessions)
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((s: any) => {
        const sessionDate = new Date(s.start_time);
        return {
          date: sessionDate.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' }),
          time: sessionDate.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
          subject: s.subjects?.name || '–',
          price: Number(s.price || 0).toFixed(2),
        };
      });

    const studentName =
      (junction || []).map((r: any) => r.sessions?.students?.full_name).find(Boolean) ||
      batch.payer_name ||
      'Mokinys';

    const periodStart = batch.period_start_date
      ? new Date(batch.period_start_date).toLocaleDateString('lt-LT')
      : '';
    const periodEnd = batch.period_end_date
      ? new Date(batch.period_end_date).toLocaleDateString('lt-LT')
      : '';
    const periodText = periodStart && periodEnd ? `${periodStart} – ${periodEnd}` : periodStart || periodEnd || '';

    const deadline = batch.payment_deadline_date ? new Date(batch.payment_deadline_date) : null;
    const deadlineStr = deadline && !Number.isNaN(deadline.getTime())
      ? deadline.toLocaleDateString('lt-LT', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : undefined;

    const totalAmount = Number(batch.total_amount || 0).toFixed(2);
    const usesManual = tutorUsesManualStudentPayments(tutor);
    const bankDetails = trimManualPaymentBankDetails(tutor.manual_payment_bank_details);
    const stablePaymentLink = `${appOrigin}/api/pay-invoice?batch=${batch.id}`;

    const emailData: Record<string, unknown> = usesManual
      ? {
          recipientName: batch.payer_name || undefined,
          studentName,
          tutorName: tutor.full_name || 'Korepetitorius',
          periodText,
          sessions: sessionsForEmail,
          lessonsTotal: totalAmount,
          totalAmount,
          paymentDeadline: deadlineStr,
          manualPaymentInstructions: true,
          bankDetails: bankDetails || undefined,
          paymentLink: `${appOrigin}/student/sessions`,
          ...(tutor.organization_id ? { organizationId: tutor.organization_id } : {}),
        }
      : {
          recipientName: batch.payer_name || undefined,
          studentName,
          tutorName: tutor.full_name || 'Korepetitorius',
          periodText,
          sessions: sessionsForEmail,
          lessonsTotal: totalAmount,
          totalAmount,
          paymentDeadline: deadlineStr,
          paymentLink: stablePaymentLink,
          ...(tutor.organization_id ? { organizationId: tutor.organization_id } : {}),
        };

    const emailPayload: Record<string, unknown> = {
      type: 'monthly_invoice',
      to: toEmail,
      data: emailData,
    };

    const { data: inv } = await supabase
      .from('invoices')
      .select('invoice_number, pdf_storage_path')
      .eq('billing_batch_id', batch.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inv?.pdf_storage_path) {
      const { data: blob } = await supabase.storage.from('invoices').download(inv.pdf_storage_path);
      if (blob) {
        emailPayload.attachments = [{
          filename: `${inv.invoice_number || 'saskaita'}.pdf`,
          content: Buffer.from(await blob.arrayBuffer()).toString('base64'),
        }];
      }
    }

    const requestOrigin = req.headers.origin ? String(req.headers.origin) : null;
    const emailRes = await fetch(`${requestOrigin || appOrigin}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
      body: JSON.stringify(emailPayload),
    });
    if (!emailRes.ok) {
      const txt = await emailRes.text().catch(() => '');
      return json(res, 502, { error: 'Nepavyko išsiųsti priminimo', details: txt || String(emailRes.status) });
    }

    return json(res, 200, { success: true });
  } catch (err: any) {
    console.error('[resend-monthly-invoice] error:', err);
    return json(res, 500, { error: 'Internal Server Error', details: err?.message || String(err) });
  }
}
