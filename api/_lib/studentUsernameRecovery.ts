import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { findAuthUserByEmail } from './findAuthUserByEmail.js';
import { getResendApiKey } from './resendConfig.js';
import { localizedFromEmail } from './i18n.js';
import { resolveEmailOrgBranding } from './emailOrgBranding.js';
import { managedFamilyAccountsEnabled } from '../../src/lib/managedFamilyAccounts.js';
import { studentLoginNameFromEmail } from '../../src/lib/studentLoginIdentity.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

/** The recipient comes only from server-controlled provisioning metadata, never the reset request. */
export async function sendStudentUsernameRecovery(
  db: SupabaseClient,
  authEmail: string,
  redirectTo: string,
): Promise<void> {
  const existing = await findAuthUserByEmail(db, authEmail);
  if (!existing) return;

  const { data, error } = await db.auth.admin.getUserById(existing.id);
  const user = data.user;
  const loginName = user?.app_metadata?.student_login_name;
  const recipient = user?.app_metadata?.student_contact_email;
  const organizationId = typeof user?.app_metadata?.provisioned_by_organization === 'string'
    ? user.app_metadata.provisioned_by_organization
    : '';
  if (
    error
    || !user?.email_confirmed_at
    || !organizationId
    || typeof loginName !== 'string'
    || loginName !== studentLoginNameFromEmail(authEmail)
    || typeof recipient !== 'string'
    || !recipient.trim().includes('@')
  ) return;

  const { data: org } = await db
    .from('organizations')
    .select('name, logo_url, brand_color, brand_color_secondary, features')
    .eq('id', organizationId)
    .maybeSingle();
  const features = org?.features && typeof org.features === 'object'
    ? org.features as Record<string, unknown>
    : null;
  if (!org || !managedFamilyAccountsEnabled(organizationId, features)) return;

  const resolved = resolveEmailOrgBranding(organizationId, org);
  const brandName = resolved.publicName || resolved.branding?.name || 'Tutlio';
  const primary = resolved.branding?.brand_color || '#4f46e5';
  const secondary = resolved.branding?.brand_color_secondary || primary;
  const brandMark = resolved.branding?.logo_url
    ? `<img src="${escapeHtml(resolved.branding.logo_url)}" alt="${escapeHtml(brandName)}" style="display:block;max-height:56px;max-width:200px;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:22px;font-weight:700;">${escapeHtml(brandName)}</span>`;
  const signature = resolved.emailTeamSignature || brandName;

  const apiKey = getResendApiKey();
  if (!apiKey) return;
  if (Number(user.app_metadata.student_recovery_sent_at || 0) > Date.now() - 60_000) return;

  const { error: markError } = await db.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      student_recovery_sent_at: Date.now(),
    },
  });
  if (markError) return;

  const { data: recovery, error: recoveryError } = await db.auth.admin.generateLink({
    type: 'recovery',
    email: authEmail,
    options: { redirectTo },
  });
  if (recoveryError || !recovery.properties?.action_link) return;

  await new Resend(apiKey).emails.send({
    from: localizedFromEmail('lt', { senderName: resolved.emailSenderName }),
    to: recipient.trim(),
    subject: `${brandName}: vaiko slaptažodžio atkūrimas`,
    html: `<!doctype html><html lang="lt"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;">
      <div style="max-width:560px;margin:24px auto;background:#ffffff;">
        <div style="padding:28px 24px;text-align:center;background-color:${primary};background:linear-gradient(135deg,${primary},${secondary});">${brandMark}</div>
        <div style="padding:28px 24px;color:#374151;font-size:14px;line-height:1.6;">
          <p>Gautas prašymas atkurti ${escapeHtml(String(user.user_metadata?.full_name || ''))} mokinio paskyros slaptažodį.</p>
          <p>Prisijungimo vardas: <strong>${escapeHtml(loginName)}</strong></p>
          <p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(recovery.properties.action_link)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${primary};color:#ffffff;text-decoration:none;font-weight:600;">Pasirinkti naują slaptažodį</a></p>
          <p>Jei atkūrimo neprašėte, šį laišką ignoruokite.</p>
        </div>
        <div style="padding:18px 24px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:12px;">${escapeHtml(signature)}</div>
      </div>
    </body></html>`,
  });
}
