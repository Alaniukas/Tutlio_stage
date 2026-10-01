// POST /api/resend-monthly-invoice
// Body: { billingBatchId }
//
// Tutor (owner) or org admin re-sends the unpaid monthly invoice email
// with a stable /api/pay-invoice link (and S.F. PDF when available).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { marketFromRequest } from './_lib/market.js';
import { lessonCheckoutBreakdownCents, orgFeeProfile } from './_lib/marketMoney.js';
import { resolveOrgPayerFeeSplit } from './_lib/orgPayerFeeSplit.js';
import { retrieveConnectCheckoutSessionWithScope } from './_lib/stripeDirectCharge.js';
import {
  tutorUsesManualStudentPayments,
  trimManualPaymentBankDetails,
} from './_lib/soloManualStudentPayments.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { lessonEmailDateTime } from './_lib/lessonLocalTime.js';
import { orgHasPvmEducationInvoice } from './_lib/pvmEducationInvoice.js';

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
        payer_email, payer_name, payment_deadline_date, stripe_checkout_session_id,
        profiles!billing_batches_tutor_id_fkey(
          id, full_name, organization_id, enable_manual_student_payments, manual_payment_bank_details,
          subscription_plan, manual_subscription_exempt, stripe_account_id
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

    const { data: junction, error: junctionError } = await supabase
      .from('billing_batch_sessions')
      .select('session_id, session_price, sessions(id, student_id, start_time, price, subjects(name), students(full_name))')
      .eq('billing_batch_id', batch.id);
    if (junctionError || !junction?.length) {
      return json(res, 502, { error: 'Nepavyko įkelti sąskaitos pamokų' });
    }

    const sessionsForEmail = (junction || [])
      .map((row: any) => row.sessions ? { ...row.sessions, price: row.session_price } : null)
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((s: any) => {
        const when = lessonEmailDateTime(new Date(s.start_time));
        return {
          date: when.date,
          time: when.time,
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

    const lessonsTotal = Number(batch.total_amount || 0).toFixed(2);
    const usesManual = tutorUsesManualStudentPayments(tutor);
    const bankDetails = trimManualPaymentBankDetails(tutor.manual_payment_bank_details);
    const stablePaymentLink = `${appOrigin}/api/pay-invoice?batch=${batch.id}`;
    let ownerName = tutor.full_name || 'Korepetitorius';
    let checkoutTotalCents = Math.round(Number(batch.total_amount || 0) * 100);
    let org: any = null;
    if (tutor.organization_id) {
      const { data, error } = await supabase.from('organizations')
        .select('name, stripe_account_id, entity_type, slug, features')
        .eq('id', tutor.organization_id).single();
      if (error || !data) return json(res, 502, { error: 'Nepavyko įkelti organizacijos mokėjimo nustatymų' });
      org = data;
      ownerName = org.name || ownerName;
    }
    if (!usesManual) {
      const market = marketFromRequest(req);
      const feeProfile = orgFeeProfile(org?.slug) ?? orgFeeProfile(tutor.organization_id);
      const feeSplit = resolveOrgPayerFeeSplit(org?.features);
      if (!(org?.entity_type === 'school' && !feeProfile)) {
        checkoutTotalCents = feeProfile
          ? lessonCheckoutBreakdownCents(Number(batch.total_amount), market, feeProfile, feeSplit).totalCents
          : junction.reduce((sum: number, row: any) => sum
            + lessonCheckoutBreakdownCents(Number(row.session_price) || 0, market, null, feeSplit).totalCents, 0);
      }
      // The payer link reuses an open Checkout even after the org changes its
      // fee settings. The reminder must quote that exact existing amount.
      if (batch.stripe_checkout_session_id) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
        const accountId = org?.stripe_account_id || tutor.stripe_account_id;
        try {
          const lookup = await retrieveConnectCheckoutSessionWithScope(stripe, batch.stripe_checkout_session_id, accountId);
          if (lookup.stripeAccount === accountId && lookup.session.status === 'open'
            && Number.isFinite(lookup.session.amount_total)) {
            checkoutTotalCents = lookup.session.amount_total!;
          }
        } catch {
          // pay-invoice also renews unavailable sessions with the current fees.
        }
      }
    }
    const totalAmount = (checkoutTotalCents / 100).toFixed(2);
    const fees = checkoutTotalCents / 100 - Number(batch.total_amount || 0);

    const emailData: Record<string, unknown> = usesManual
      ? {
          recipientName: batch.payer_name || undefined,
          studentName,
          tutorName: ownerName,
          periodText,
          sessions: sessionsForEmail,
          lessonsTotal,
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
          tutorName: ownerName,
          periodText,
          sessions: sessionsForEmail,
          lessonsTotal,
          platformFees: fees > 0 ? fees.toFixed(2) : undefined,
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

    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, invoice_number, pdf_storage_path, pdf_meta')
      .eq('billing_batch_id', batch.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true });
    if (invoicesError) return json(res, 502, { error: 'Nepavyko įkelti sąskaitų PDF' });

    // A legacy BB-* summary means the original request omitted S.F. Keep that
    // reminder valid without attachments. Actual PVM child invoices must cover
    // every billed lesson before a family reminder can be sent.
    const requiresCompletePvmInvoices = orgHasPvmEducationInvoice(org?.features)
      && invoices?.some(inv => (inv.pdf_meta as { layout?: string } | null)?.layout === 'pvm_education');
    if (requiresCompletePvmInvoices) {
      const expectedStudentCount = new Set(junction.map((row: any) => row.sessions?.student_id).filter(Boolean)).size;
      if (!expectedStudentCount || invoices.length !== expectedStudentCount) {
        return json(res, 409, { error: 'Pirmiausia sugeneruokite visų vaikų sąskaitas ir PDF' });
      }
      const { data: lineItems, error: lineItemsError } = await supabase.from('invoice_line_items')
        .select('session_ids').in('invoice_id', invoices.map(inv => inv.id));
      if (lineItemsError) return json(res, 502, { error: 'Nepavyko patikrinti sąskaitų pamokų' });
      const invoicedSessionIds = new Set((lineItems || []).flatMap(item => item.session_ids || []));
      if (junction.some((row: any) => !invoicedSessionIds.has(row.session_id))) {
        return json(res, 409, { error: 'Pirmiausia sugeneruokite visų vaikų sąskaitas ir PDF' });
      }
    }

    const attachments = [];
    for (const inv of invoices || []) {
      if (!inv.pdf_storage_path) {
        if (requiresCompletePvmInvoices) return json(res, 409, { error: 'Pirmiausia sugeneruokite sąskaitos PDF' });
        continue;
      }
      const { data: blob, error } = await supabase.storage.from('invoices').download(inv.pdf_storage_path);
      if (error || !blob) return json(res, 502, { error: 'Nepavyko įkelti sąskaitos PDF' });
      attachments.push({
          filename: `${inv.invoice_number || 'saskaita'}.pdf`,
          content: Buffer.from(await blob.arrayBuffer()).toString('base64'),
      });
    }
    if (attachments.length) emailPayload.attachments = attachments;

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
