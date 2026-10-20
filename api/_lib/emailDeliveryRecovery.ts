import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthEmailLocale } from '../../src/lib/auth-locale.js';
import { AUTH_EMAIL_COPY } from '../../src/lib/i18n/authEmailCopy.js';
import { renderAuthEmail } from './authEmailTemplates.js';
import { emailDeliveryRedirect } from './emailDeliveryRedirects.js';
import { Resend } from './resendClient.js';
import { getFromEmail, getResendApiKey } from './resendConfig.js';

/** Supabase's standard recovery sender uses the Auth login as its recipient.
 * Generate a link for that same account, then deliver through our mail boundary.
 * Unknown accounts and throttled requests retain the normal success response. */
export async function sendRedirectedEmailRecovery(db: SupabaseClient, input: {
  email: string; userId: string | null; redirectTo: string; locale: AuthEmailLocale;
}): Promise<boolean> {
  if (!emailDeliveryRedirect(input.email)) return false;
  if (!input.userId || process.env.TUTLIO_DEV_SUPPRESS_EMAIL === '1') return true;
  const userResult = await db.auth.admin.getUserById(input.userId);
  if (userResult.error || !userResult.data.user) throw new Error('Recovery account lookup failed');
  const user = userResult.data.user;
  if (user.email?.trim().toLowerCase() !== input.email.trim().toLowerCase()) throw new Error('Recovery account changed');
  if (Date.parse(user.recovery_sent_at || '') > Date.now() - 60_000) return true;
  const key = getResendApiKey();
  if (!key) throw new Error('Recovery email service is not configured');
  const recovery = await db.auth.admin.generateLink({
    type: 'recovery', email: user.email, options: { redirectTo: input.redirectTo },
  });
  if (recovery.error || !recovery.data.properties?.action_link
    || recovery.data.user?.id !== input.userId) throw new Error('Recovery link generation failed');
  const result = await new Resend(key).emails.send({
    from: getFromEmail(), to: user.email,
    subject: `Tutlio — ${AUTH_EMAIL_COPY[input.locale].resetTitle}`,
    html: renderAuthEmail(input.locale, 'recovery', recovery.data.properties.action_link),
  });
  if (result.error || !result.data?.id) throw new Error('Recovery email delivery was not confirmed');
  return true;
}
