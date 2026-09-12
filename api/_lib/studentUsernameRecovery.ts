import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { findAuthUserByEmail } from './findAuthUserByEmail.js';
import { isMoksloVaisiaiOrg } from './marketMoney.js';
import { getFromEmail, getResendApiKey } from './resendConfig.js';
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
  if (
    error
    || !user?.email_confirmed_at
    || !isMoksloVaisiaiOrg(user.app_metadata.provisioned_by_organization)
    || typeof loginName !== 'string'
    || loginName !== studentLoginNameFromEmail(authEmail)
    || typeof recipient !== 'string'
    || !recipient.trim().includes('@')
  ) return;

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
    from: getFromEmail(),
    to: recipient.trim(),
    subject: 'Mokslo vaisiai: vaiko slaptažodžio atkūrimas',
    html: `<p>Gautas prašymas atkurti ${escapeHtml(String(user.user_metadata?.full_name || ''))} mokinio paskyros slaptažodį.</p><p>Prisijungimo vardas: <strong>${escapeHtml(loginName)}</strong></p><p><a href="${escapeHtml(recovery.properties.action_link)}">Pasirinkti naują slaptažodį</a></p><p>Jei atkūrimo neprašėte, šį laišką ignoruokite.</p>`,
  });
}
