import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from './_lib/resendClient.js';
import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminSeatByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { managedFamilyAccountsEnabled } from '../src/lib/managedFamilyAccounts.js';
import { studentRegistrationInvitationTarget, buildStudentRegistrationReminderEmail } from './_lib/studentRegistrationReminders.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { resolveOrgEmailReplyToWithServiceClient } from './_lib/orgEmailReplyTo.js';
import { getResendApiKey } from './_lib/resendConfig.js';

/** Reuse the existing account's activation link; never create an account or reset a password. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });
  const studentId = String(req.method === 'GET' ? req.query?.studentId || '' : req.body?.studentId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId' });
  }
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = await getOrgAdminSeatByUserId(db, auth.userId);
    if (!admin || admin.status !== 'active' || !hasOrgAdminPermission(admin.role, admin.permissions, 'students.edit')) {
      return res.status(403).json({ error: 'Insufficient organization permission' });
    }
    const { data: student, error: studentError } = await db.from('students')
      .select('id, organization_id, full_name, email, payer_email, invite_code, linked_user_id, parent_user_id')
      .eq('id', studentId).eq('organization_id', admin.organizationId).is('detached_at', null).maybeSingle();
    if (studentError) throw studentError;
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const { data: org, error: orgError } = await db.from('organizations')
      .select('id, name, preferred_locale, logo_url, brand_color, brand_color_secondary, features')
      .eq('id', admin.organizationId).maybeSingle();
    if (orgError) throw orgError;
    if (!org || !managedFamilyAccountsEnabled(org.id, org.features)
      || org.features?.school_family_portal === true || org.features?.school_family_accounts_setup === true) {
      return res.status(403).json({ error: 'Managed family accounts disabled' });
    }
    const deliveryWindow = Math.floor(Date.now() / 300_000);
    const target = await studentRegistrationInvitationTarget(db, org, student, publicOriginFromRequest(req), {
      activationIssuedAt: deliveryWindow * 300_000,
    });
    if (!target) return res.status(200).json({ ok: true, skipped: true, reason: 'already_registered' });
    if (req.method === 'GET') return res.status(200).json({ ok: true, url: target.url, to: target.to });
    if (process.env.TUTLIO_DEV_API_LOCAL === '1' && process.env.TUTLIO_DEV_SUPPRESS_EMAIL === '1') {
      return res.status(200).json({ ok: true, suppressed: true, to: target.to });
    }
    const key = getResendApiKey();
    if (!key) return res.status(503).json({ error: 'Email provider unavailable' });
    const email = buildStudentRegistrationReminderEmail(org, student.full_name || '', target.url);
    const replyTo = await resolveOrgEmailReplyToWithServiceClient(org.id);
    const identity = createHash('sha256').update(target.identity).digest('hex').slice(0, 32);
    const deliveryKey = `registration:manual:${org.id}:${identity}:${deliveryWindow}`;
    const sent = await new Resend(key).emails.send({ ...email, to: [target.to], ...(replyTo ? { replyTo } : {}) }, {
      idempotencyKey: deliveryKey,
    });
    if (sent.error || !sent.data?.id) return res.status(502).json({ error: 'Email delivery not confirmed' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[student-registration-invitation] Request failed', error instanceof Error ? error.message : 'Database error');
    return res.status(503).json({ error: 'Registration invitation unavailable' });
  }
}
