/**
 * Welcome email for a freshly self-provisioned enterprise organization admin.
 * Sent in-process via Resend from the Stripe webhook (same pattern as
 * sendTutorInviteResend / sendParentInviteEmail).
 */
import { Resend } from 'resend';
import { localeDirection } from '../../src/lib/i18n/locales.js';
import { getResendApiKey, resendNotConfiguredMessage } from './resendConfig.js';
import { t, isValidLocale, localizedFromEmail, type Locale } from './i18n.js';
import { outlookEmailButton, headerInlineStyle } from './outlookEmail.js';

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .header { background-color: #111827; background: linear-gradient(135deg, #111827 0%, #374151 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0; }
    .body { padding: 32px 24px; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #f0f0f0; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 4px 0; }
  </style>
`;

function wrap(content: string, locale: Locale): string {
  return `<!DOCTYPE html>
<html lang="${locale}" dir="${localeDirection(locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${baseStyles}</head>
<body dir="${localeDirection(locale)}" style="margin:0;padding:0;background-color:#f3f4f6;">
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

export type EnterpriseWelcomeEmailData = {
  companyName: string;
  licenseCount: number;
  /** Supabase recovery action link for the admin to set their password. */
  setupLink: string;
  locale?: string;
};

export async function sendEnterpriseWelcomeEmail(
  to: string,
  data: EnterpriseWelcomeEmailData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, error: resendNotConfiguredMessage() };
  }

  const locale: Locale = isValidLocale(data.locale) ? data.locale : 'lt';
  const subject = t(locale, 'em.entWelcomeSub', { org: data.companyName });
  const html = wrap(
    `
      <div class="header" style="${headerInlineStyle('#111827', '#374151')}"><h1>${t(locale, 'em.entWelcomeHeader')}</h1><p>${t(locale, 'em.entWelcomeHeaderSub')}</p></div>
      <div class="body">
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.entWelcomeBody', { org: data.companyName, count: data.licenseCount })}</p>
        <div style="text-align:center; margin:24px 0;">
          ${outlookEmailButton(data.setupLink, t(locale, 'em.entWelcomeBtn'), '#4f46e5', { fontWeight: '600', fontSize: '15px', padding: '14px 28px' })}
        </div>
        <p style="color:#4b5563; font-size:13px; line-height:1.6;">${t(locale, 'em.entWelcomeNext')}</p>
        <p style="color:#9ca3af; font-size:12px;">${t(locale, 'em.linkNotWorking')} ${data.setupLink}</p>
      </div>${footerFor(locale)}`,
    locale,
  );

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: localizedFromEmail(locale),
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
