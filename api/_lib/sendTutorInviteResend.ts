/**
 * Tutor invitation email via Resend (directly from invite-tutor).
 * Not via HTTP to /api/send-email — Vercel serverless terminates fire-and-forget fetch after response.
 * Matches send-email.ts `tutor_invite` (LT only, Outlook-safe layout).
 */
import { Resend } from 'resend';
import { t, type Locale } from './i18n.js';
import { outlookEmailButton, headerInlineStyle } from './outlookEmail.js';

const FROM_EMAIL = process.env.FROM_EMAIL || 'Tutlio <onboarding@tutlio.lt>';

const getAppUrl = () => process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .header { background-color: #6366f1; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 16px; color: #1f2937; margin: 0 0 16px; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #f0f0f0; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 4px 0; }
  </style>
`;

function wrap(content: string, locale: Locale): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${baseStyles}</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background-color:#f3f4f6;">
<tr><td align="center" style="padding:20px 12px;background-color:#f3f4f6;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;max-width:560px;width:100%;background-color:#ffffff;">
<tr><td style="padding:0;background-color:#ffffff;">
  <div style="background-color:#ffffff;padding:20px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
    <span style="font-size:26px;font-weight:900;color:#4f46e5;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>
  </div>
  ${content}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

function footerFor(locale: Locale): string {
  return `<div class="footer"><p>${t(locale, 'em.teamSignature')}</p><p style="margin:8px 0 0; font-size:11px; color:#9ca3af;">${t(locale, 'em.unsubscribe')}</p></div>`;
}

export type TutorInviteEmailData = {
  inviteToken: string;
  orgName: string | null;
  inviteeName: string | null;
  inviteeEmail: string;
};

export async function sendTutorInviteEmail(
  to: string,
  data: TutorInviteEmailData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY_STAGE || process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'Email service not configured' };
  }

  const locale: Locale = 'lt';
  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/register?org_token=${data.inviteToken || ''}`;
  const greetingName = data.inviteeName || data.inviteeEmail || t(locale, 'em.tutorInviteDefault');
  const orgLabel = data.orgName || 'Tutlio';

  const subject = t(locale, 'em.tutorInviteSub', { org: orgLabel });
  const html = wrap(
    `
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}"><h1>${t(locale, 'em.tutorInviteHeader')}</h1><p>${t(locale, 'em.tutorInviteHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiNameNoEmoji', { name: greetingName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.tutorInviteBody', { org: orgLabel })}</p>
        <div style="text-align:center; margin:24px 0;">
          ${outlookEmailButton(inviteLink, t(locale, 'em.btnCompleteReg'), '#4f46e5', { fontWeight: '600', fontSize: '15px', padding: '14px 28px' })}
        </div>
        <p style="color:#9ca3af; font-size:12px;">${t(locale, 'em.linkNotWorking')} ${inviteLink}</p>
      </div>${footerFor(locale)}`,
    locale
  );

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html,
  });

  if (error) {
    const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : 'Failed to send email';
    return { ok: false, error: msg };
  }
  return { ok: true };
}
