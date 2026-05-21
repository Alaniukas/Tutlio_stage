/**
 * Parent invitation email via Resend (in-process).
 * Avoids HTTP to /api/send-email — unreliable on localhost and can be cut off on Vercel.
 */
import { Resend } from 'resend';
import { t, localizedFromEmail, type Locale } from './i18n.js';
import { headerInlineStyle } from './outlookEmail.js';

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .header { background-color: #7c3aed; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
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
<tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;max-width:560px;width:100%;background-color:#ffffff;">
<tr><td style="padding:0;">
  <div style="background-color:#ffffff;padding:20px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
    <span style="font-size:26px;font-weight:900;color:#7c3aed;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>
  </div>
  ${content}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

function footerFor(locale: Locale): string {
  return `<div class="footer"><p>${t(locale, 'em.teamSignature')}</p><p style="margin:8px 0 0; font-size:11px; color:#9ca3af;">${t(locale, 'em.unsubscribe')}</p></div>`;
}

export type ParentInviteEmailData = {
  parentName?: string | null;
  studentName: string;
  registerLink: string;
  code: string;
  locale?: string;
  /** Shown in manual fallback copy (e.g. tutlio.com vs tutlio.lt). */
  publicHost?: string;
};

export async function sendParentInviteEmail(
  to: string,
  data: ParentInviteEmailData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'Email service not configured (RESEND_API_KEY)' };
  }

  const locale: Locale = (data.locale as Locale) || 'lt';
  const parentName = data.parentName?.trim() || '';
  const studentName = data.studentName?.trim() || '';
  const registerLink = data.registerLink?.trim() || '';
  const code = data.code?.trim() || '';
  let hostLabel = data.publicHost?.trim() || '';
  if (!hostLabel && registerLink) {
    try {
      hostLabel = new URL(registerLink).host;
    } catch {
      hostLabel = 'tutlio.lt';
    }
  }
  if (!hostLabel) hostLabel = 'tutlio.lt';

  const subject = t(locale, 'em.parentInviteSub');

  const html = wrap(
    `
      <div class="header" style="${headerInlineStyle('#7c3aed', '#6d28d9')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">${t(locale, 'em.parentInviteHeader')}</h1>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiNameNoEmoji', { name: parentName || studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.parentInviteBody', { student: studentName })}
        </p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.parentInviteBenefits')}
        </p>
        <div style="text-align:center; margin:24px 0;">
          <a href="${registerLink}" style="display:inline-block; background:#7c3aed; color:#fff; font-weight:700; font-size:15px; padding:14px 36px; border-radius:12px; text-decoration:none;">
            ${t(locale, 'em.parentInviteBtnCreate')}
          </a>
        </div>
        ${
          code
            ? `<p style="color:#4b5563; font-size:14px; line-height:1.6; text-align:center;">
          ${t(locale, 'em.parentInviteCodeFallback', { host: hostLabel, code })}
        </p>`
            : ''
        }
      </div>${footerFor(locale)}`,
    locale,
  );

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: localizedFromEmail(locale),
    to: [to.trim().toLowerCase()],
    subject,
    html,
  });

  if (error) {
    const msg =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: string }).message)
        : 'Failed to send email';
    console.error('[sendParentInviteEmail]', { to, msg });
    return { ok: false, error: msg };
  }
  return { ok: true };
}
