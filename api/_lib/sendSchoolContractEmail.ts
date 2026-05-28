/**
 * School contract email via Resend (in-process).
 * Avoids HTTP to /api/send-email — Vercel serverless terminates fire-and-forget fetch after response.
 */
import { Resend } from 'resend';
import { getResendApiKey, resendNotConfiguredMessage } from './resendConfig.js';
import { localizedFromEmail, type Locale } from './i18n.js';
import { headerInlineStyle, outlookEmailButton } from './outlookEmail.js';

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .header { background-color: #059669; background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 16px; color: #1f2937; margin: 0 0 16px; }
    .info-card { background: #f8f7ff; border: 1px solid #e5e3ff; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #f0f0f0; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 4px 0; }
  </style>
`;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function td(label: string, value: string, withBorder = true): string {
  const border = withBorder ? 'border-bottom:1px solid #ede9fe;' : '';
  return `<tr>
    <td style="padding:8px 0;${border} color:#6b7280; font-size:13px; width:42%;">${label}</td>
    <td style="padding:8px 0;${border} color:#111827; font-size:13px; font-weight:600;">${value}</td>
  </tr>`;
}

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
    <span style="font-size:26px;font-weight:900;color:#059669;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>
  </div>
  ${content}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

function footerFor(locale: Locale): string {
  return `<div class="footer"><p>${locale === 'en' ? 'Tutlio team' : 'Tutlio komanda'}</p></div>`;
}

export type SchoolContractEmailData = {
  schoolName?: string;
  schoolEmail?: string;
  studentName?: string;
  parentName?: string;
  recipientName?: string;
  parentPhone?: string;
  parentPersonalCode?: string;
  childBirthDate?: string;
  address?: string;
  contractNumber?: string;
  annualFee?: number | string;
  date?: string;
  pdfUrl?: string;
  completionUrl?: string;
  missingFields?: string[];
  locale?: string;
};

function buildSchoolContractEmail(data: SchoolContractEmailData, locale: Locale) {
  const missingFields = Array.isArray(data.missingFields)
    ? data.missingFields.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const completionLink = missingFields.length > 0 ? String(data.completionUrl || '').trim() : '';
  const missingFieldsHtml = missingFields.length
    ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:14px; margin:16px 0;">
        <p style="color:#9a3412; font-size:13px; font-weight:700; margin:0 0 8px;">Prašome papildyti trūkstamus duomenis:</p>
        <ul style="margin:0; padding-left:18px; color:#7c2d12; font-size:13px; line-height:1.5;">
          ${missingFields.map((item) => `<li>${esc(item)}</li>`).join('')}
        </ul>
        <p style="margin:10px 0 0; color:#7c2d12; font-size:13px; line-height:1.55; font-weight:700;">
          Svarbu: sutartį pasirašyti galėsite tik po to, kai užpildysite trūkstamus duomenis.
          Po užpildymo mokykla atsiųs naują sutarties PDF su visais duomenimis.
        </p>
      </div>`
    : '';

  const updatedNote = missingFields.length === 0 && data.pdfUrl
    ? `<p style="color:#047857; font-size:14px; line-height:1.6; font-weight:600; margin:0 0 16px;">
        Sutartis atnaujinta su jūsų pateiktais duomenimis. Peržiūrėkite ir pasirašykite PDF versiją.
      </p>`
    : '';

  return {
    subject: `Metinio mokesčio sutartis${data.contractNumber ? ` Nr. ${data.contractNumber}` : ''} — ${data.studentName || 'Mokinys'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Metinio mokesčio sutartis</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(data.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(data.recipientName || data.parentName || data.studentName)},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Prašome peržiūrėti metinio mokesčio sutartį mokiniui <strong>${esc(data.studentName)}</strong> (${esc(data.schoolName)}).
        </p>
        ${updatedNote}
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Sutarties Nr.', esc(data.contractNumber || '—'))}
            ${td('Mokinys', esc(data.studentName))}
            ${td('Metinis mokestis', data.annualFee ? `€${data.annualFee}` : '—')}
            ${td('Tėvų telefonas', esc(data.parentPhone || '—'))}
            ${td('Vaiko gimimo data', esc(data.childBirthDate || '—'))}
            ${td('Adresas', esc(data.address || '—'))}
            ${td('Data', data.date || new Date().toLocaleDateString('lt-LT'), false)}
          </table>
        </div>
        ${missingFieldsHtml}
        ${data.pdfUrl ? `<div style="margin:16px 0 10px;">${outlookEmailButton(data.pdfUrl, 'Atidaryti PDF sutartį', '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 24px' })}</div>` : ''}
        ${missingFields.length > 0 && completionLink ? `<div style="margin:0 0 20px;">${outlookEmailButton(completionLink, 'Papildyti trūkstamus duomenis', '#2563eb', { fontWeight: '600', fontSize: '14px', padding: '12px 24px' })}</div>` : ''}
        <p style="color:#6b7280; font-size:13px;">Jei turite klausimų, susisiekite su mokykla: ${esc(data.schoolEmail || '')}.</p>
      </div>${footerFor(locale)}`, locale),
  };
}

export async function sendSchoolContractEmail(
  to: string,
  data: SchoolContractEmailData,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, error: resendNotConfiguredMessage() };
  }

  const locale: Locale = data.locale === 'en' ? 'en' : 'lt';
  const emailContent = buildSchoolContractEmail(data, locale);
  const resend = new Resend(apiKey);
  const { data: result, error } = await resend.emails.send({
    from: localizedFromEmail(locale),
    to: [to.trim().toLowerCase()],
    subject: emailContent.subject,
    html: emailContent.html,
  });

  if (error) {
    const msg =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: string }).message)
        : 'Failed to send email';
    console.error('[sendSchoolContractEmail]', { to, msg });
    return { ok: false, error: msg };
  }

  return { ok: true, id: result?.id };
}
