// POST /api/resend-package-email
// Body: { packageId }
//
// Org admin re-sends the payment email for a pending package (stable
// /api/pay-package link; manual packages resend the bank-transfer request,
// re-attaching the S.F. PDF when one was issued).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });

  const { packageId } = (req.body || {}) as { packageId?: string };
  if (!packageId) return json(res, 400, { error: 'Missing packageId' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) return json(res, 401, { error: 'Unauthorized' });

    const adminAccess = await getOrgAdminAccessByUserId(supabase, authData.user.id);
    if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'finance.edit')) {
      return json(res, 403, { error: 'Only an administrator with finance edit access can resend package emails' });
    }
    const adminRow = { organization_id: adminAccess.organizationId };

    const { data: pkg, error: pkgErr } = await supabase
      .from('lesson_packages')
      .select(`
        id, tutor_id, student_id, total_lessons, price_per_lesson, total_price, paid, payment_status,
        payment_method, manual_sales_invoice_id,
        students!inner(full_name, email, payer_email, payer_name),
        profiles!lesson_packages_tutor_id_fkey(full_name, organization_id, manual_payment_bank_details),
        lesson_package_items(subject_id, total_lessons, price_per_lesson, total_price, position, subjects!inner(name))
      `)
      .eq('id', packageId)
      .single();
    if (pkgErr || !pkg) return json(res, 404, { error: 'Paketas nerastas', details: pkgErr?.message });

    const tutor = pkg.profiles as any;
    if (tutor?.organization_id !== adminRow.organization_id) {
      return json(res, 403, { error: 'Package belongs to another organization' });
    }
    if (pkg.paid || pkg.payment_status === 'paid') {
      return json(res, 400, { error: 'Paketas jau apmokėtas' });
    }
    if (pkg.payment_status === 'cancelled') {
      return json(res, 400, { error: 'Paketas atšauktas — sukurkite naują' });
    }

    const student = pkg.students as any;
    const toEmail = String(student?.payer_email || student?.email || '').trim();
    if (!toEmail) return json(res, 400, { error: 'Mokinys neturi el. pašto adreso' });

    const items = (Array.isArray(pkg.lesson_package_items) ? pkg.lesson_package_items : [])
      .slice()
      .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
      .map((it: any) => ({
        subjectName: (it.subjects?.name as string) || 'Pamoka',
        totalLessons: Number(it.total_lessons) || 0,
        pricePerLesson: Number(it.price_per_lesson) || 0,
      }));
    const firstItem = items[0] || {
      subjectName: 'Pamoka',
      totalLessons: Number(pkg.total_lessons) || 0,
      pricePerLesson: Number(pkg.price_per_lesson) || 0,
    };

    // Org display name + org id for whitelabel branding.
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, features')
      .eq('id', adminRow.organization_id)
      .maybeSingle();
    const orgFeatures = (org?.features && typeof org.features === 'object' && !Array.isArray(org.features)
      ? (org.features as Record<string, unknown>)
      : {});
    const orgDisplayName = String((orgFeatures.public_name as string) || org?.name || tutor?.full_name || 'Korepetitorius');

    const appOrigin = publicOriginFromRequest(req);
    const isManual = pkg.payment_method === 'manual';

    const emailPayload: Record<string, unknown> = isManual
      ? {
          type: 'manual_package_request',
          to: toEmail,
          data: {
            recipientName: student.payer_name || student.full_name,
            studentName: student.full_name,
            orgName: orgDisplayName,
            items,
            subjectName: firstItem.subjectName,
            pricePerLesson: firstItem.pricePerLesson.toFixed(2),
            totalLessons: Number(pkg.total_lessons) || items.reduce((n, it) => n + it.totalLessons, 0),
            totalPrice: Number(pkg.total_price || 0).toFixed(2),
            bankDetails: String(tutor?.manual_payment_bank_details || ''),
            organizationId: adminRow.organization_id,
          },
        }
      : {
          type: 'prepaid_package_request',
          to: toEmail,
          data: {
            recipientName: student.payer_name || student.full_name,
            studentName: student.full_name,
            tutorName: orgDisplayName,
            subjectName: items.map((it) => it.subjectName).join(', ') || firstItem.subjectName,
            totalLessons: Number(pkg.total_lessons) || items.reduce((n, it) => n + it.totalLessons, 0),
            pricePerLesson: firstItem.pricePerLesson.toFixed(2),
            totalPrice: Number(pkg.total_price || 0).toFixed(2),
            paymentLink: `${appOrigin}/api/pay-package?package=${pkg.id}`,
            organizationId: adminRow.organization_id,
          },
        };

    // Re-attach the S.F. PDF when one was already issued for this package.
    if (pkg.manual_sales_invoice_id) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, pdf_storage_path')
        .eq('id', pkg.manual_sales_invoice_id)
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
    }

    const requestOrigin = req.headers.origin ? String(req.headers.origin) : null;
    const emailRes = await fetch(`${requestOrigin || appOrigin}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
      body: JSON.stringify(emailPayload),
    });
    if (!emailRes.ok) {
      const txt = await emailRes.text().catch(() => '');
      return json(res, 502, { error: 'Nepavyko išsiųsti laiško', details: txt || String(emailRes.status) });
    }

    return json(res, 200, { success: true });
  } catch (err: any) {
    console.error('[resend-package-email] error:', err);
    return json(res, 500, { error: 'Internal Server Error', details: err?.message || String(err) });
  }
}
