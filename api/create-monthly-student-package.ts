import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { previewMonthlyStudentPackage } from './_lib/monthlyStudentPackage.js';
import {
  deliverPooledPackageOffer,
  ensurePooledMonthlyRenewal,
} from './_lib/pooledMonthlyGeneration.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const body = req.body;
  if (!body || typeof body.studentId !== 'string' || typeof body.preview !== 'boolean' || body.packageId) {
    return res.status(400).json({ error: 'studentId and preview are required. Existing package terms cannot be changed.' });
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server configuration error' });
  const db = createClient(url, key);
  try {
    const access = await getOrgAdminAccessByUserId(db, auth.userId);
    if (!access || !hasOrgAdminPermission(access.role, access.permissions, 'finance.edit')) return res.status(403).json({ error: 'Forbidden' });
    const orgId = access.organizationId;
    if (!isProKlaseOrg(orgId)) return res.status(403).json({ error: 'This package flow is not enabled for this organization' });
    const student = await db.from('students').select('id,tutor_id').eq('id', body.studentId).eq('organization_id', orgId).is('detached_at', null).single();
    if (student.error || !student.data) return res.status(404).json({ error: 'Student not found' });
    const org = await db.from('organizations').select('features,stripe_account_id,stripe_onboarding_complete').eq('id', orgId).single();
    if (org.error) throw new Error(org.error.message);
    if (org.data?.features?.monthly_packages !== true) return res.status(403).json({ error: 'Monthly packages are disabled' });
    if (org.data?.features?.manual_payments === true) return res.status(409).json({ error: 'Consolidated packages require the configured Stripe payment flow.' });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const periodStart = body.periodStart ?? `${today.slice(0, 7)}-01`;
    if (typeof periodStart !== 'string') return res.status(400).json({ error: 'Invalid period start' });
    const preview = await previewMonthlyStudentPackage(db, body.studentId, orgId, periodStart);
    if (body.preview) return res.status(200).json(preview);
    if (body.previewToken !== preview.previewToken) return res.status(409).json({ error: 'The schedule or price changed. Refresh the preview.', code: 'stale_preview' });
    if (!org.data.stripe_account_id || !org.data.stripe_onboarding_complete) return res.status(409).json({ error: 'Organization payment account is not connected' });
    const created = await db.rpc('create_org_student_package', {
      p_student_id: body.studentId, p_org_id: orgId, p_student_ids: preview.studentIds,
      p_items: preview.items, p_unit_price: preview.pricePerLesson, p_period_start: preview.periodStart,
      p_period_end: preview.periodEnd, p_preview_token: preview.previewToken,
      p_session_ids: preview.sessionIds,
    });
    if (created.error) return res.status(409).json({ error: created.error.message });
    const packageId = created.data as string;
    const origin = publicOriginFromRequest(req);
    const paymentUrl = `${origin}/api/pay-package?package=${packageId}`;
    // The internal credential must never be forwarded to a client-controlled Origin.
    const serverOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.APP_URL || process.env.VITE_APP_URL);
    if (!serverOrigin) {
      return res.status(200).json({ success: true, packageId, paymentUrl, emailSent: false, emailPending: true });
    }
    const delivery = await deliverPooledPackageOffer(db, {
      packageId,
      organizationId: orgId,
      appOrigin: origin,
      sendEmailOrigin: serverOrigin,
      serviceRoleKey: key,
    });
    if (delivery.status === 'sent' || delivery.status === 'already_sent') {
      await ensurePooledMonthlyRenewal(db, {
        organizationId: orgId,
        studentIds: preview.studentIds,
        periodStart: preview.periodStart,
        createdBy: auth.userId,
      });
    }
    return res.status(200).json({
      success: true,
      packageId,
      paymentUrl,
      emailSent: delivery.status === 'sent',
      emailPending: delivery.status === 'pending',
      ...(delivery.error ? { emailError: delivery.error } : {}),
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create monthly package' });
  }
}
