import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { isRegistrationOverdue, studentRegistrationEnabled, type StudentRegistrationState } from '../../src/lib/studentRegistration.js';
import { registrationText } from '../../src/lib/studentRegistrationCopy.js';
import { orgStudentIdentityGroupKey } from '../../src/lib/orgStudentIdentity.js';
import { loadStudentRegistrationStates } from './studentRegistration.js';
import { buildMvAccountActivationToken, buildMvAccountActivationUrl } from './mvAccountActivationToken.js';
import { resolveEmailOrgBranding, applyOrgBrandingToHtml, type OrgRowForEmailBranding } from './emailOrgBranding.js';
import { localizedFromEmail, type Locale } from './i18n.js';
import { orgAwareOrigin } from './public-origin.js';
import { resolveOrgEmailReplyToWithServiceClient } from './orgEmailReplyTo.js';
import { getResendApiKey } from './resendConfig.js';
import { outlookEmailButton } from './outlookEmail.js';

type ReminderStudent = {
  id: string; organization_id: string; full_name: string; email: string | null;
  payer_email: string | null; invite_code: string; linked_user_id: string | null; parent_user_id: string | null;
};
type ReminderOrg = OrgRowForEmailBranding & { id: string; preferred_locale?: string | null; features: Record<string, unknown> };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function buildStudentRegistrationReminderEmail(org: ReminderOrg, studentName: string, url: string) {
  const locale = org.preferred_locale || 'lt';
  const resolved = resolveEmailOrgBranding(org.id, org);
  const name = resolved.publicName || org.name || 'Tutlio';
  const color = resolved.branding?.brand_color || org.brand_color || '#4f46e5';
  const subject = registrationText(locale, 'emailSubject', { org: name });
  const logo = resolved.branding?.logo_url
    ? `<img src="${escapeHtml(resolved.branding.logo_url)}" alt="${escapeHtml(name)}" style="max-height:56px;max-width:200px" />`
    : `<strong>${escapeHtml(name)}</strong>`;
  let html = `<!doctype html><html lang="${locale}"><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;padding:28px;border-radius:12px">
    ${logo}<h1 style="font-size:22px">${escapeHtml(subject)}</h1>
    <p>${registrationText(locale, 'emailBody', { student: escapeHtml(studentName) })}</p>
    ${outlookEmailButton(url, registrationText(locale, 'emailButton'), color)}
    <p style="font-size:13px;color:#64748b">${registrationText(locale, 'emailCredentials')}</p>
    <p>${escapeHtml(resolved.emailTeamSignature || name)}</p></div></body></html>`;
  html = applyOrgBrandingToHtml(html, { branding: resolved.branding, emailTeamSignature: resolved.emailTeamSignature,
    locale: locale as Locale, emailContactEmail: resolved.emailContactEmail, emailContactPhone: resolved.emailContactPhone,
    emailFooterPoweredBy: resolved.emailFooterPoweredBy === true });
  return { subject, html, from: localizedFromEmail(locale as Locale, { senderName: resolved.emailSenderName || name }) };
}

export async function studentRegistrationInvitationTarget(db: SupabaseClient, org: ReminderOrg, student: ReminderStudent, origin: string,
  options: { activationIssuedAt?: number } = {}) {
  const userId = student.parent_user_id || student.linked_user_id;
  const role = student.parent_user_id ? 'parent' as const : 'student' as const;
  const appOrigin = orgAwareOrigin(org.preferred_locale, origin);
  if (userId) {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || !data.user) throw new Error('Registration account lookup failed');
    const user = data.user;
    if (user.last_sign_in_at || user.app_metadata?.mv_account_activated_at || user.user_metadata?.mv_account_activated_at
      || (!user.app_metadata?.provisioned_by_organization && user.email_confirmed_at)) return null;
    const identifier = String(user.app_metadata?.student_login_name || user.email || '');
    const to = role === 'parent' ? user.email : user.app_metadata?.student_login_name
      ? user.app_metadata?.student_contact_email || student.email || student.payer_email : user.email;
    if (!identifier || !to || !String(to).includes('@')) throw new Error('Registration recipient unavailable');
    const token = buildMvAccountActivationToken({ studentId: student.id, role, email: identifier, issuedAt: options.activationIssuedAt });
    return { to: String(to).trim().toLowerCase(), url: buildMvAccountActivationUrl(appOrigin, token), identity: userId };
  }
  const to = student.payer_email || student.email;
  if (!to || !student.invite_code) throw new Error('Registration recipient unavailable');
  return { to: to.trim().toLowerCase(), url: `${appOrigin}/book/${encodeURIComponent(student.invite_code)}`,
    identity: orgStudentIdentityGroupKey(student) };
}

/** One transactional reminder after 24h, only for clients with a future lesson. */
export async function runStudentRegistrationReminders(db: SupabaseClient, origin: string) {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (process.env.TUTLIO_DEV_SUPPRESS_EMAIL === '1' || !getResendApiKey()) return result;
  const resend = new Resend(getResendApiKey()!);
  const attempted = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data: orgs, error: orgError } = await db.from('organizations')
      .select('id, name, preferred_locale, logo_url, brand_color, brand_color_secondary, features')
      .order('id').range(offset, offset + 999);
    if (orgError) throw orgError;
    for (const org of (orgs || []) as ReminderOrg[]) {
      if (!studentRegistrationEnabled(org.id, org.features)) continue;
      const states = await loadStudentRegistrationStates(db, org.id);
      for (const state of states) {
        if (!state.next_session_at || !isRegistrationOverdue(state)) continue;
        if (attempted.size >= 250) return result;
        try {
          const { data: student, error } = await db.from('students')
            .select('id, organization_id, full_name, email, payer_email, invite_code, linked_user_id, parent_user_id')
            .eq('id', state.student_id).eq('organization_id', org.id).maybeSingle<ReminderStudent>();
          if (error || !student) throw new Error('Registration student lookup failed');
          const target = await studentRegistrationInvitationTarget(db, org, student, origin);
          if (!target) { result.skipped++; continue; }
          const hash = createHash('sha256').update(target.identity).digest('hex').slice(0, 32);
          const deliveryKey = `registration:${org.id}:${hash}:24h:v1`;
          if (attempted.has(deliveryKey)) continue;
          const { data: delivered, error: deliveryError } = await db.from('student_registration_reminders')
            .select('delivery_key').eq('delivery_key', deliveryKey).maybeSingle();
          if (deliveryError) throw deliveryError;
          if (delivered) { result.skipped++; continue; }
          // Recheck all linked family accounts immediately before sending.
          const { data: fresh, error: freshError } = await db.rpc('org_student_registration_states', {
            p_organization_id: org.id, p_tutor_id: null,
          }).eq('student_id', student.id).maybeSingle<StudentRegistrationState>();
          if (freshError) throw freshError;
          if (!fresh?.registration_pending || !fresh.next_session_at) { result.skipped++; continue; }
          if (attempted.size) await new Promise((resolve) => setTimeout(resolve, 600));
          attempted.add(deliveryKey);
          const email = buildStudentRegistrationReminderEmail(org, student.full_name, target.url);
          const replyTo = await resolveOrgEmailReplyToWithServiceClient(org.id);
          const response = await resend.emails.send({ ...email, to: [target.to], ...(replyTo ? { replyTo } : {}) }, { idempotencyKey: deliveryKey });
          if (response.error || !response.data?.id) throw new Error(response.error?.message || 'Email delivery not confirmed');
          const { error: saveError } = await db.from('student_registration_reminders').upsert({
            delivery_key: deliveryKey, organization_id: org.id, student_id: student.id,
          }, { onConflict: 'delivery_key', ignoreDuplicates: true });
          if (saveError) throw saveError;
          result.sent++;
        } catch (error) { console.error('[registration-reminders]', error); result.failed++; }
      }
    }
    if (!orgs || orgs.length < 1000) return result;
  }
}
