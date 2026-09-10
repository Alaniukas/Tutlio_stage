/**
 * Mokslo vaisiai — atskiras aktyvavimo laiškas tėvui arba mokiniui.
 */
import { Resend } from 'resend';
import { getResendApiKey, resendNotConfiguredMessage } from './resendConfig.js';
import { t, localizedFromEmail, type Locale } from './i18n.js';
import { headerInlineStyle, outlookEmailButton } from './outlookEmail.js';
import {
  applyOrgBrandingToHtml,
  resolveEmailOrgBranding,
  type OrgRowForEmailBranding,
} from './emailOrgBranding.js';
import { MOKSLO_VAISIAI_BRAND_COLOR, MOKSLO_VAISIAI_BRAND_COLOR_SECONDARY } from './marketMoney.js';
import type { MvActivationRole } from './mvAccountActivationToken.js';

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .header { padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .body { padding: 32px 24px; }
    .cred-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .cred-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px; }
    .cred-value { font-size: 15px; color: #111827; font-weight: 600; margin: 0 0 12px; word-break: break-all; }
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
  ${content}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

function footerFor(locale: Locale, branded?: boolean): string {
  const unsub = branded
    ? ''
    : `<p style="margin:8px 0 0; font-size:11px; color:#9ca3af;">${t(locale, 'em.unsubscribe')}</p>`;
  return `<div class="footer"><p>${t(locale, 'em.teamSignature')}</p>${unsub}</div>`;
}

export type MvAccountActivationEmailData = {
  role: MvActivationRole;
  recipientName?: string | null;
  studentName: string;
  accountEmail: string;
  tempPassword: string;
  activationUrl: string;
  orgName?: string | null;
  organizationId?: string | null;
  org?: OrgRowForEmailBranding | null;
  locale?: string;
};

export async function sendMvAccountActivationEmail(
  to: string,
  data: MvAccountActivationEmailData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, error: resendNotConfiguredMessage() };
  }

  const locale: Locale = (data.locale as Locale) || 'lt';
  const recipientName = data.recipientName?.trim() || '';
  const studentName = data.studentName?.trim() || '';
  const activationUrl = data.activationUrl?.trim() || '';
  const isParent = data.role === 'parent';

  const resolved = resolveEmailOrgBranding(data.organizationId, data.org || { name: data.orgName });
  const orgLabel = resolved.publicName || data.orgName || resolved.branding?.name || '';
  const headerColor = resolved.branding?.brand_color || MOKSLO_VAISIAI_BRAND_COLOR;
  const headerSecondary = resolved.branding?.brand_color_secondary || MOKSLO_VAISIAI_BRAND_COLOR_SECONDARY;

  const subject = isParent
    ? t(locale, 'em.mvActivationParentSub', { student: studentName })
    : t(locale, 'em.mvActivationStudentSub', { student: studentName });

  const bodyIntro = isParent
    ? t(locale, 'em.mvActivationParentBody', { org: orgLabel, student: studentName })
    : t(locale, 'em.mvActivationStudentBody', { org: orgLabel, student: studentName });

  const accountLabel = isParent
    ? t(locale, 'em.mvFamilyAccountsParentBlock')
    : t(locale, 'em.mvFamilyAccountsStudentBlock', { student: studentName });

  let html = wrap(
    `
      <div class="header" style="${headerInlineStyle(headerColor, headerSecondary)}">
        <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">${t(locale, 'em.mvActivationHeader')}</h1>
      </div>
      <div class="body">
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 16px;">
          ${t(locale, 'em.hiNameNoEmoji', { name: recipientName || studentName })}
        </p>
        <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 8px;">${bodyIntro}</p>
        <p style="color:#374151;font-size:14px;font-weight:600;margin:20px 0 8px;">${accountLabel}</p>
        <div class="cred-box">
          <p class="cred-label">${t(locale, 'em.mvFamilyAccountsEmailLabel')}</p>
          <p class="cred-value">${data.accountEmail}</p>
          <p class="cred-label">${t(locale, 'em.mvFamilyAccountsPassword')}</p>
          <p class="cred-value" style="font-family:monospace;font-size:16px;">${data.tempPassword}</p>
        </div>
        <div style="text-align:center;margin:28px 0 16px;">
          ${outlookEmailButton(activationUrl, t(locale, 'em.mvActivationBtn'), headerColor, { fontWeight: '600', fontSize: '15px', padding: '14px 28px' })}
        </div>
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">${t(locale, 'em.mvActivationAfterBtn')}</p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:12px 0 0;">${t(locale, 'em.mvFamilyAccountsChangePassword')}</p>
      </div>
      ${footerFor(locale, !!(resolved.emailContactEmail || resolved.emailFooterPoweredBy))}`,
    locale,
  );

  html = applyOrgBrandingToHtml(html, {
    branding: resolved.branding,
    emailTeamSignature: resolved.emailTeamSignature,
    locale,
    emailContactPhone: resolved.emailContactPhone,
    emailContactEmail: resolved.emailContactEmail,
    emailFooterPoweredBy: resolved.emailFooterPoweredBy === true,
  });

  const resend = new Resend(apiKey);
  const from = localizedFromEmail(locale, { senderName: resolved.emailSenderName });
  const { error } = await resend.emails.send({
    from,
    to: [to.trim()],
    subject,
    html,
  });

  if (error) {
    console.error('[sendMvAccountActivationEmail]', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/** @deprecated Use sendMvAccountActivationEmail per role. */
export async function sendMvFamilyAccountsEmail(
  to: string,
  data: {
    parentName?: string | null;
    studentName: string;
    parentEmail: string;
    parentPassword: string;
    studentEmail: string;
    studentPassword: string;
    loginUrl: string;
    orgName?: string | null;
    organizationId?: string | null;
    locale?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendMvAccountActivationEmail(to, {
    role: 'parent',
    recipientName: data.parentName,
    studentName: data.studentName,
    accountEmail: data.parentEmail,
    tempPassword: data.parentPassword,
    activationUrl: data.loginUrl,
    orgName: data.orgName,
    organizationId: data.organizationId,
    locale: data.locale,
  });
}
