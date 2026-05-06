// ─── Vercel Serverless Function: Send Email via Resend ───────────────────────
// POST /api/send-email
// Body: { type, to, data }
// All templates are inlined to avoid Vercel module resolution issues.

import type { VercelRequest, VercelResponse } from './types';
import { t, type Locale } from './_lib/i18n.js';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { outlookEmailButton, headerInlineStyle } from './_lib/outlookEmail.js';
import { sendPushForEmail } from './_lib/sendPush.js';

const resend = new Resend(process.env.RESEND_API_KEY_STAGE || process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'Tutlio <onboarding@tutlio.lt>';

function randomToken() {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

async function createSchoolCompletionUrl(contractId: string, req: VercelRequest): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !contractId) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const { error } = await supabase.from('school_contract_completion_tokens').insert({
    contract_id: contractId,
    token,
    expires_at: expiresAt,
  });
  if (error) return null;

  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  const protoHeader = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto']
    : Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : '';
  const inferredAppUrl = host ? `${protoHeader || 'https'}://${host}` : '';
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || inferredAppUrl || 'https://tutlio.lt';
  return `${appUrl.replace(/\/$/, '')}/school-contract-complete?token=${encodeURIComponent(token)}`;
}

function escapeHtml(unsafe: unknown): string {
  return String(unsafe ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function esc(value: unknown): string {
  return escapeHtml(value);
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function isHtmlField(key: string): boolean {
  return key.endsWith('Html') || key.endsWith('HTML');
}

function sanitizeEmailData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeEmailData);
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'string') {
      out[key] = isHtmlField(key) ? val : esc(val);
    } else if (typeof val === 'object' && val !== null) {
      out[key] = sanitizeEmailData(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ─── Shared Styles & Template Wrapper ────────────────────────────────────────

// Use environment-aware APP_URL
const getAppUrl = () => {
  return process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';
};

function prefersManualInstructions(d: any): boolean {
  return d?.manualPaymentInstructions === true || d?.manualPaymentInstructions === 'true';
}

/** Nekintantys tekstai rankinio mokėjimo el. paštu – neklauso `src/lib/i18n` pakrovimo į serverio bundle / `t()` grandinės. */
const MANUAL_OFF_PLATFORM_PAY_COPY = {
  lt: {
    lead:
      'Pamoką apmokėkite pagal žemiau pateiktus korepetitoriaus duomenis iki nurodyto termino (kortele per platformą šio korepetitoriaus mokėjimas negalimas).',
    portalHint:
      'Po pavedimo ar kito mokėjimo korepetitorius pažymės pamoką apmokėtą sistemoje — būseną pamatysite „Pamokų“ puslapyje Tutlio aplikacijoje.',
    btnParent: 'Atidaryti mokinio pamokų peržiūrą',
    btnStudent: 'Atidaryti pamokų puslapį',
  },
  en: {
    lead:
      "Pay using your tutor's instructions below before the deadline. This tutor does not accept card checkout on the platform.",
    portalHint:
      'After you pay, your tutor marks the lesson in Tutlio — you can track status on your Lessons page.',
    btnParent: 'Open lesson overview',
    btnStudent: 'Open my lessons page',
  },
} as const;

function manualPayLocale(lc: Locale): 'lt' | 'en' {
  return lc === 'en' ? 'en' : 'lt';
}

/** Already HTML-escaped strings from sanitizeEmailData. */
function manualBankDetailsInnerHtml(d: { bankDetails?: string }, locale: Locale): string {
  const raw = typeof d.bankDetails === 'string' ? d.bankDetails.trim() : '';
  if (!raw) return '';
  return `<div style="background:#fefce8; border:1px solid #fde047; border-radius:12px; padding:16px; margin:16px 0;">
    <p style="color:#854d0e; font-size:13px; font-weight:700; margin:0 0 10px;">${t(locale, 'em.manualPkgBankHeading')}</p>
    <pre style="color:#713f12; font-size:14px; margin:0; white-space:pre-wrap; font-family:ui-monospace,Menlo,Consolas,monospace; line-height:1.55;">${raw}</pre>
  </div>`;
}

function manualOffPlatformPaymentHtml(d: { bankDetails?: string; payerIsParent?: boolean }, locale: Locale): string {
  const appUrl = getAppUrl();
  const portalHref = d.payerIsParent ? `${appUrl}/parent/lessons` : `${appUrl}/student/sessions`;
  const m = MANUAL_OFF_PLATFORM_PAY_COPY[manualPayLocale(locale)];
  const portalLabel = d.payerIsParent ? m.btnParent : m.btnStudent;
  return `
    ${manualBankDetailsInnerHtml(d, locale)}
    <p style="color:#374151; font-size:14px; line-height:1.6; margin:16px 0 8px;">${m.lead}</p>
    <div style="text-align:center; margin-top: 20px;">
      ${outlookEmailButton(portalHref, portalLabel, '#64748b', { fontSize: '15px', padding: '14px 32px', fontWeight: '600' })}
    </div>
    <p style="color:#9ca3af; font-size:12px; text-align:center; margin-top:16px;">${m.portalHint}</p>
  `;
}

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background-color: #6366f1; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 16px; color: #1f2937; margin: 0 0 16px; }
    .info-card { background: #f8f7ff; border: 1px solid #e5e3ff; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #f0f0f0; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 4px 0; }
  </style>
`;

interface EmailBranding {
  name: string;
  logo_url: string | null;
  brand_color: string;
}

function wrap(content: string, locale: Locale = 'lt', branding?: EmailBranding | null): string {
  const brandName = branding?.name || 'Tutlio';
  const logoHtml = branding?.logo_url
    ? `<img src="${branding.logo_url}" alt="${brandName}" style="max-height:36px;max-width:160px;" />`
    : `<span style="font-size:26px;font-weight:900;color:#4f46e5;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>`;
  const poweredBy = branding?.name
    ? `<p style="color:#9ca3af;font-size:11px;margin:8px 0 0;">powered by Tutlio</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${baseStyles}</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background-color:#f3f4f6;">
<tr><td align="center" style="padding:20px 12px;background-color:#f3f4f6;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;max-width:560px;width:100%;background-color:#ffffff;">
<tr><td style="padding:0;background-color:#ffffff;">
  <div style="background-color:#ffffff;padding:20px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
    ${logoHtml}${poweredBy}
  </div>
  ${content}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

const td = (label: string, value: string, border = true) =>
  `<tr><td style="padding:10px 0;${border ? ' border-bottom:1px solid #f0eeff;' : ''} color:#6b7280; font-size:14px;">${label}</td><td style="padding:10px 0;${border ? ' border-bottom:1px solid #f0eeff;' : ''} color:#1f2937; font-size:14px; font-weight:600; text-align:right;">${value}</td></tr>`;
const table = (rows: string) => `<div class="info-card"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table></div>`;
const footerFor = (locale: Locale) => `<div class="footer"><p>${t(locale, 'em.teamSignature')}</p><p style="margin:8px 0 0; font-size:11px; color:#9ca3af;">${t(locale, 'em.unsubscribe')}</p></div>`;

const formatMoney = (value: string | number, currency = 'EUR', loc: Locale = 'lt') => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat(loc === 'en' ? 'en-US' : 'lt-LT', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

// ─── Email Templates ─────────────────────────────────────────────────────────

function bookingPlannerIntroKey(bookedBy: unknown): 'em.bookingPayerIntroStudent' | 'em.bookingPayerIntroTutor' | 'em.bookingPayerIntroOrgAdmin' {
  if (bookedBy === 'org_admin') return 'em.bookingPayerIntroOrgAdmin';
  if (bookedBy === 'student') return 'em.bookingPayerIntroStudent';
  return 'em.bookingPayerIntroTutor';
}

function bookingConfirmation(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const hidePayment = d.hidePaymentInfo;
  const feeText = d.cancellationFeePercent > 0 ? t(locale, 'em.feePercent', { percent: String(d.cancellationFeePercent) }) : t(locale, 'em.freeCancel');
  const cancelText = d.cancellationHours ? t(locale, 'em.cancelBefore', { hours: String(d.cancellationHours), fee: feeText }) : t(locale, 'em.cancelNA');
  const localizedPaymentStatus =
    d.paymentStatus === 'paid' ? t(locale, 'em.statusPaid') :
    d.paymentStatus === 'pending' ? t(locale, 'em.statusPending') :
    d.paymentStatus || t(locale, 'em.statusReserved');
  const payerIntro = d.forPayer
    ? `<p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, bookingPlannerIntroKey(d.bookedBy), { student: d.studentName, tutor: d.tutorName })}</p>`
    : `<p class="greeting">${t(locale, 'em.hiName', { name: d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.bookingStudentIntro', { tutor: d.tutorName })}</p>`;
  const subjectLine = d.forPayer
    ? t(locale, 'em.bookingSubPayer', { date: d.date, time: d.time })
    : t(locale, 'em.bookingSub', { date: d.date, time: d.time });

  const meetingLinkRow = d.meetingLink
    ? td(t(locale, 'em.labelLink'), `<a href="${d.meetingLink}" style="color:#6366f1; font-weight:600; text-decoration:none;">${t(locale, 'em.btnJoinNow')}</a>`, !hidePayment && !!(d.price || d.cancellationHours || d.paymentStatus))
    : '';

  const paymentRows = hidePayment ? '' : (
    (d.price ? td(t(locale, 'em.labelPrice'), `€${d.price}`) : '') +
    (d.cancellationHours ? td(t(locale, 'em.labelCancellation'), cancelText) : '') +
    td(t(locale, 'em.labelStatus'), localizedPaymentStatus, false)
  );

  const paymentButton = !hidePayment && d.paymentLink
    ? `<div style="text-align:center; margin-top: 20px;">
        ${outlookEmailButton(String(d.paymentLink), t(locale, 'em.btnPayNow'), '#059669', { padding: '14px 36px', fontSize: '15px' })}
      </div>`
    : '';

  return {
    subject: subjectLine,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}"><h1>${t(locale, 'em.bookingHeader')}</h1><p>${t(locale, 'em.bookingHeaderSub')}</p></div>
      <div class="body">
        ${payerIntro}
        ${table(
          td(t(locale, 'em.labelDate'), d.date) + 
          td(t(locale, 'em.labelTime'), d.time) + 
          (d.duration ? td(t(locale, 'em.labelDuration'), `${d.duration} ${t(locale, 'em.min')}`) : '') + 
          td(t(locale, 'em.labelTutor'), d.tutorName) + 
          (d.subject ? td(t(locale, 'em.labelSubject'), d.subject) : '') + 
          meetingLinkRow +
          paymentRows
        )}
        ${paymentButton}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnViewLessons'), '#4f46e5', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function bookingNotification(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const localizedPaymentStatus =
    d.paymentStatus === 'paid' ? t(locale, 'em.statusPaid') :
    d.paymentStatus === 'pending' ? t(locale, 'em.statusPending') :
    d.paymentStatus || t(locale, 'em.statusWaiting');
  /** Org-affiliated tutors: no Stripe/platform payment narrative (billing is organisational). */
  const isOrgSchoolTutorBooking = !!(d.organizationTutor || d.hidePaymentStatus);

  const statusParagraph = d.scheduledByOrgAdmin
    ? `<p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.bookingNotifAdminBody', { student: d.studentName })}</p>`
    : isOrgSchoolTutorBooking
      ? `<p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.bookingNotifOrgTutorBody', { student: d.studentName })}</p>`
      : `<p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.bookingNotifWithStatus', { student: d.studentName, status: localizedPaymentStatus })}</p>`;

  const headerSub = d.scheduledByOrgAdmin
    ? t(locale, 'em.bookingNotifAdminSub')
    : isOrgSchoolTutorBooking
      ? t(locale, 'em.bookingNotifOrgTutorSub')
      : t(locale, 'em.bookingNotifStudentSub');
  return {
    subject: d.scheduledByOrgAdmin
      ? t(locale, 'em.bookingNotifSubAdmin', { student: d.studentName, date: d.date })
      : t(locale, 'em.bookingNotifSub', { student: d.studentName, date: d.date }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}"><h1>${t(locale, 'em.bookingNotifHeader')}</h1><p>${headerSub}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.tutorName })}</p>
        ${statusParagraph}
        ${table(td(t(locale, 'em.labelStudent'), d.studentName) + td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time, false))}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/dashboard`, t(locale, 'em.btnViewCalendar'), '#4f46e5', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function sessionCancelled(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const by = d.cancelledBy === 'student' ? t(locale, 'em.cancelByStudent') : t(locale, 'em.cancelByTutor');
  const targetUrl = d.cancelledBy === 'tutor' ? `${appUrl}/student/sessions` : `${appUrl}/dashboard`;
  const showRefund = !d.hideRefund && d.isPaid && d.sessionPrice;
  const refundHtml = showRefund
    ? `<div style="background:#fef9c3; border:1px solid #fde047; border-radius:12px; padding:16px; margin:16px 0;"><p style="color:#713f12; font-size:14px; font-weight:700; margin:0 0 6px;">${t(locale, 'em.refundTitle')}</p><p style="color:#78350f; font-size:13px; margin:0; line-height:1.5;">${t(locale, 'em.refundMsg', { price: String(d.sessionPrice) })}</p></div>`
    : '';
  return {
    subject: t(locale, 'em.cancelSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#ef4444', '#f97316')}"><h1>${t(locale, 'em.cancelHeader')}</h1><p>${t(locale, 'em.cancelHeaderSub', { by })}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.cancelBody', { student: d.studentName, tutor: d.tutorName })}</p>
        <div class="info-card" style="background:#fef2f2; border-color:#fecaca;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time, !d.reason)}</table></div>
        ${d.reason ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:16px; margin:16px 0;"><p style="color:#9a3412; font-size:13px; font-weight:600; margin:0 0 4px;">${t(locale, 'em.cancelReason')}</p><p style="color:#c2410c; font-size:14px; margin:0; line-height:1.5;">${d.reason}</p></div>` : ''}
        ${refundHtml}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(targetUrl, t(locale, 'em.btnBackToSystem'), '#e5e7eb', { textColor: '#374151', fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function sessionCancelledParent(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.cancelParentSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#ef4444', '#f97316')}"><h1>${t(locale, 'em.cancelHeader')}</h1><p>${t(locale, 'em.cancelParentHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.cancelParentBody', { student: d.studentName, tutor: d.tutorName })}</p>
        <div class="info-card" style="background:#fef2f2; border-color:#fecaca;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time, !d.reason)}</table></div>
        ${d.reason ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:16px; margin:16px 0;"><p style="color:#9a3412; font-size:13px; font-weight:600; margin:0 0 4px;">${t(locale, 'em.cancelReason')}</p><p style="color:#c2410c; font-size:14px; margin:0; line-height:1.5;">${d.reason}</p></div>` : ''}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnBackToSystem'), '#e5e7eb', { textColor: '#374151', fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function sessionStudentNoShowPayer(d: any, locale: Locale) {
  return {
    subject: t(locale, 'em.noShowSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#64748b', '#475569')}"><h1>${t(locale, 'em.noShowHeader')}</h1><p>${t(locale, 'em.noShowHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.noShowBody', { tutor: d.tutorName, student: d.studentName })}</p>
        <div class="info-card" style="background:#f8fafc; border-color:#e2e8f0;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${td(t(locale, 'em.labelStudent'), d.studentName)}
        ${td(t(locale, 'em.labelTutorAlt'), d.tutorName)}
        ${td(t(locale, 'em.labelDate'), d.date)}
        ${td(t(locale, 'em.labelTime'), d.time)}
        </table></div>
        <p style="color:#6b7280; font-size:13px; line-height:1.5;">${t(locale, 'em.contactTutor')} <a href="mailto:${d.tutorEmail || ''}" style="color:#6366f1;">${d.tutorEmail || '–'}</a>.</p>
      </div>${footerFor(locale)}`, locale),
  };
}

function sessionReminder(d: any, locale: Locale) {
  return {
    subject: t(locale, 'em.reminderSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#f59e0b', '#f97316')}"><h1>${t(locale, 'em.reminderHeader')}</h1><p>${t(locale, 'em.reminderHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName || t(locale, 'em.roleStudent') })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.reminderBody', { topic: d.topic || '–' })}</p>
        <div class="info-card" style="background:#fffbeb; border-color:#fde68a;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${td(d.isTutor ? t(locale, 'em.labelStudent') : t(locale, 'em.labelTutorAlt'), d.otherName)}
        ${td(t(locale, 'em.labelDate'), d.date)}
        ${td(t(locale, 'em.labelTime'), d.time)}
        ${td(t(locale, 'em.labelDuration'), d.duration ? d.duration + ' ' + t(locale, 'em.min') : '60 ' + t(locale, 'em.min'))}
        ${!d.isTutor ? td(t(locale, 'em.labelPriceAlt'), d.price ? '€' + d.price : '–', !d.meetingLink && !d.tutorComment) : ''}
        ${d.meetingLink ? `<tr><td style="padding:10px 0;${!d.whiteboardLink && !d.tutorComment ? ' border-bottom:1px solid #f0eeff;' : ''} color:#6b7280; font-size:14px;">${t(locale, 'em.labelLink')}</td><td style="padding:10px 0;${!d.whiteboardLink && !d.tutorComment ? ' border-bottom:1px solid #f0eeff;' : ''} text-align:right;"><a href="${d.meetingLink}" style="color:#6366f1; font-weight:600; font-size:14px; text-decoration:none;">${t(locale, 'em.btnJoinNow')}</a></td></tr>` : ''}
        ${d.whiteboardLink ? `<tr><td style="padding:10px 0;${!d.tutorComment ? ' border-bottom:1px solid #f0eeff;' : ''} color:#6b7280; font-size:14px;">${t(locale, 'em.labelWhiteboard')}</td><td style="padding:10px 0;${!d.tutorComment ? ' border-bottom:1px solid #f0eeff;' : ''} text-align:right;"><a href="${d.whiteboardLink}" style="color:#7c3aed; font-weight:600; font-size:14px; text-decoration:none;">${t(locale, 'em.btnOpenWhiteboard')}</a></td></tr>` : ''}
        ${d.tutorComment ? `<tr><td colspan="2" style="padding:16px 0 0 0;"><div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:16px;"><p style="color:#1e3a8a; font-size:13px; font-weight:700; margin:0 0 6px 0;">${t(locale, 'em.tutorComment')}</p><div style="color:#1e40af; font-size:14px; line-height:1.5; white-space:pre-wrap;">${d.tutorComment}</div></div></td></tr>` : ''}
        </table></div>
        <div style="text-align:center; margin-top:20px;">
          ${outlookEmailButton(d.isTutor ? `${getAppUrl()}/dashboard` : `${getAppUrl()}/student/sessions`, t(locale, 'em.btnGoToAccount'), '#ea580c', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function sessionReminderPayer(d: any, locale: Locale) {
  return {
    subject: t(locale, 'em.reminderPayerSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#f59e0b', '#f97316')}"><h1>${t(locale, 'em.reminderPayerHeader')}</h1><p>${t(locale, 'em.reminderPayerHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hi')}${d.recipientName ? ', ' + d.recipientName : ''}! 👋</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.reminderPayerBody', { student: d.studentName, tutor: d.tutorName })}</p>
        <div class="info-card" style="background:#fffbeb; border-color:#fde68a;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${td(t(locale, 'em.labelStudent'), d.studentName)}
        ${td(t(locale, 'em.labelTutorAlt'), d.tutorName)}
        ${td(t(locale, 'em.labelDate'), d.date)}
        ${td(t(locale, 'em.labelTime'), d.time)}
        ${td(t(locale, 'em.labelDuration'), d.duration ? d.duration + ' ' + t(locale, 'em.min') : '60 ' + t(locale, 'em.min'))}
        ${td(t(locale, 'em.labelPriceAlt'), d.price ? '€' + d.price : '–', !d.meetingLink)}
        ${d.meetingLink ? td(t(locale, 'em.labelLink'), `<a href="${d.meetingLink}" style="color:#6366f1; font-weight:600; text-decoration:none;">${t(locale, 'em.btnJoin')}</a>`, false) : ''}
        ${d.whiteboardLink ? td(t(locale, 'em.labelWhiteboard'), `<a href="${d.whiteboardLink}" style="color:#7c3aed; font-weight:600; text-decoration:none;">${t(locale, 'em.btnOpenWhiteboard')}</a>`, false) : ''}
        </table></div>
        <div class="info-card" style="background:#f8fafc; border-color:#e2e8f0;">
          <p style="color:#374151; font-size:14px; font-weight:700; margin:0 0 8px;">${t(locale, 'em.tutorContacts')}</p>
          <p style="color:#4b5563; font-size:14px; margin:0 0 6px;">📧 <a href="mailto:${d.tutorEmail || ''}" style="color:#6366f1; text-decoration:none;">${d.tutorEmail || t(locale, 'em.notSpecified')}</a></p>
          ${d.tutorPhone ? `<p style="color:#4b5563; font-size:14px; margin:0;">📱 <a href="tel:${d.tutorPhone}" style="color:#6366f1; text-decoration:none;">${d.tutorPhone}</a></p>` : ''}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function paymentRejectionReminder(d: any, locale: Locale) {
  const appUrl = getAppUrl();

  return {
    subject: t(locale, 'em.rejectSub', { date: d.date }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#ef4444', '#b91c1c')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.rejectHeader')}</h2>
        <p>${t(locale, 'em.rejectHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.rejectBody', { tutor: d.tutorName })}</p>
        ${table(td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time, false))}
        <p style="color:#6b7280; font-size:13px;">${t(locale, 'em.rejectNote')}</p>
        <div style="text-align:center; margin-top: 30px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnReviewAndPay'), '#dc2626', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

/** Org admin invites tutor: link to register with org_token */
function tutorInvite(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/register?org_token=${d.inviteToken || ''}`;
  const greetingName = d.inviteeName || d.inviteeEmail || t(locale, 'em.tutorInviteDefault');
  return {
    subject: t(locale, 'em.tutorInviteSub', { org: d.orgName || 'Tutlio' }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}"><h1>${t(locale, 'em.tutorInviteHeader')}</h1><p>${t(locale, 'em.tutorInviteHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiNameNoEmoji', { name: greetingName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.tutorInviteBody', { org: d.orgName || 'Tutlio' })}</p>
        <div style="text-align:center; margin:24px 0;">
          ${outlookEmailButton(inviteLink, t(locale, 'em.btnCompleteReg'), '#4f46e5', { fontWeight: '600', fontSize: '15px', padding: '14px 28px' })}
        </div>
        <p style="color:#9ca3af; font-size:12px;">${t(locale, 'em.linkNotWorking')} ${inviteLink}</p>
      </div>${footerFor(locale)}`, locale),
  };
}

function inviteEmail(d: any, locale: Locale) {
  const isSchoolInvite = d?.context === 'school';
  const inviteSubject = isSchoolInvite
    ? (locale === 'lt' ? 'Jūsų registracijos nuoroda mokykloje' : 'Your school registration link')
    : t(locale, 'em.studentInviteSub');
  const inviteHeader = isSchoolInvite
    ? (locale === 'lt' ? 'Kvietimas Prisijungti' : 'Invitation to join')
    : t(locale, 'em.studentInviteHeader');
  const inviteHeaderSub = isSchoolInvite
    ? (locale === 'lt' ? 'Jūsų koordinatorius kviečia į platformą' : 'Your coordinator invited you to the platform')
    : t(locale, 'em.studentInviteHeaderSub');
  const inviteBody = isSchoolInvite
    ? (locale === 'lt'
      ? `Jūsų vaikas <strong>${esc(d.studentName || '')}</strong> užregistruotas mokykloje <strong>${esc(d.tutorName || 'Mokykla')}</strong>.`
      : `Your child <strong>${esc(d.studentName || '')}</strong> is registered in <strong>${esc(d.tutorName || 'School')}</strong>.`)
    : t(locale, 'em.studentInviteBody', { tutor: d.tutorName });
  /* Inline school copy — bundled API i18n on some deployments can miss fresh keys,
   * and uppercase CSS turns a missing-key fallback into gibberish (e.g. EM.SCHOOLSTUDENTINVITECODELABEL). */
  const inviteCodeLabel = isSchoolInvite
    ? (locale === 'lt' ? 'Jūsų vaiko registracijos kodas:' : 'Your child\'s registration code:')
    : t(locale, 'em.studentInviteCodeLabel');
  const inviteCodeCaptionStyle = isSchoolInvite
    ? 'color:#6b7280; font-size:13px; margin: 0 0 8px 0; font-weight: 600;'
    : 'color:#6b7280; font-size:13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: 600;';
  return {
    subject: inviteSubject,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${inviteHeader}</h2>
        <p>${inviteHeaderSub}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${inviteBody}</p>
        <div style="background:#f8f7ff; border: 1px dashed #c7d2fe; border-radius:12px; padding:24px; margin:24px 0; text-align: center;">
          <p style="${inviteCodeCaptionStyle}">${inviteCodeLabel}</p>
          <p style="color:#4f46e5; font-size:32px; font-weight:800; letter-spacing: 4px; margin: 0; font-family: monospace;">${d.inviteCode}</p>
        </div>
        <div style="text-align:center; margin-top: 20px;">
          ${outlookEmailButton(String(d.bookingUrl), t(locale, 'em.btnCompleteReg'), '#4f46e5', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function recurringBookingConfirmation(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const count = d.totalLessons || d.sessions?.length || 0;
  const bookedBy = d.bookedBy === 'org_admin' || d.bookedBy === 'student' || d.bookedBy === 'tutor' ? d.bookedBy : 'tutor';
  const sessionsHtml = (d.sessions || []).map((s: any) =>
    `<tr style="border-bottom:1px solid #f0eeff;">
      <td style="padding:10px 12px; color:#374151; font-size:14px;">${s.date}</td>
      <td style="padding:10px 12px; color:#374151; font-size:14px;">${s.time}</td>
    </tr>`
  ).join('');

  const payerIntroKey =
    bookedBy === 'org_admin'
      ? 'em.recurringPayerIntroOrgAdmin'
      : bookedBy === 'student'
        ? 'em.recurringPayerIntroStudent'
        : 'em.recurringPayerIntroTutor';
  const studentIntroKey = bookedBy === 'org_admin' ? 'em.recurringIntroOrgAdmin' : 'em.recurringIntro';
  const intro = d.forPayer
    ? t(locale, payerIntroKey, { tutor: d.tutorName, count: String(count), student: d.studentName })
    : t(locale, studentIntroKey, { tutor: d.tutorName, count: String(count) });

  const subjectLine = d.forPayer
    ? t(locale, 'em.recurringSubPayer', { count: String(count), tutor: d.tutorName })
    : t(locale, 'em.recurringSub', { count: String(count), tutor: d.tutorName });

  const accountLink = d.forPayer ? appUrl : `${appUrl}/student/sessions`;

  return {
    subject: subjectLine,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}"><h1>${t(locale, 'em.recurringHeader')}</h1><p>${t(locale, 'em.recurringHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.forPayer ? (d.payerName || '') : d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${intro}</p>
        ${table(
          (d.subject ? td(t(locale, 'em.recurringSubjectLabel'), d.subject) : '') +
          (d.duration ? td(t(locale, 'em.recurringDurationLabel'), `${d.duration} ${t(locale, 'em.min')}`) : '') +
          td(t(locale, 'em.recurringTotalLabel'), String(count), false)
        )}
        <div style="background:#f8f7ff; border:1px solid #e5e3ff; border-radius:12px; padding:16px; margin:20px 0;">
          <h3 style="color:#4f46e5; font-size:15px; margin:0 0 12px 0; font-weight:700;">${t(locale, 'em.recurringScheduleTitle')}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr style="background:#f0eeff; border-bottom:2px solid #e5e3ff;">
                <th style="padding:10px 12px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">${t(locale, 'em.recurringThDate')}</th>
                <th style="padding:10px 12px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">${t(locale, 'em.recurringThTime')}</th>
              </tr>
            </thead>
            <tbody>${sessionsHtml}</tbody>
          </table>
        </div>
        ${d.forPayer && d.paymentReminderNote ? `
        <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:14px 16px; margin:16px 0;">
          <p style="color:#92400e; font-size:13px; line-height:1.5; margin:0;">
            💳 ${t(locale, 'em.recurringPaymentReminderNote')}
          </p>
        </div>` : ''}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(accountLink, t(locale, 'em.btnViewLessons'), '#4f46e5', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function lessonRescheduled(d: any, locale: Locale) {
  const rescheduledBy = d.rescheduledBy || 'tutor'; // 'tutor' | 'student' | 'org_admin'
  const recipientRole = d.recipientRole || 'student'; // 'tutor' | 'student' | 'payer'

  const isOrgAdmin = rescheduledBy === 'org_admin';
  const isTutorRecipient = recipientRole === 'tutor';
  const isPayerRecipient = recipientRole === 'payer';
  const wasRescheduledByRecipient = !isOrgAdmin && rescheduledBy === recipientRole;

  const recipientName = isPayerRecipient
    ? (d.recipientName || t(locale, 'em.hi'))
    : (isTutorRecipient ? d.tutorName : d.studentName);
  const otherPartyName = isTutorRecipient ? d.studentName : d.tutorName;
  const otherPartyRole = isTutorRecipient ? t(locale, 'em.roleStudent') : t(locale, 'em.roleTutor');

  let headerText: string;
  let messageText: string;

  if (isOrgAdmin) {
    headerText = t(locale, 'em.rescheduleByAdmin');
    if (isTutorRecipient) {
      messageText = t(locale, 'em.rescheduleAdminTutor', { student: d.studentName });
    } else if (isPayerRecipient) {
      messageText = t(locale, 'em.rescheduleAdminPayer', { student: d.studentName, tutor: d.tutorName });
    } else {
      messageText = t(locale, 'em.rescheduleAdminStudent', { tutor: d.tutorName });
    }
  } else if (wasRescheduledByRecipient) {
    headerText = t(locale, 'em.rescheduleBySelf');
    messageText = t(locale, 'em.rescheduleSelfBody');
  } else {
    headerText = t(locale, 'em.rescheduleByOther', { role: otherPartyRole });
    messageText = t(locale, 'em.rescheduleOtherBody', { role: otherPartyRole, name: otherPartyName });
  }

  const accountLink = isTutorRecipient ? getAppUrl() + '/dashboard' : getAppUrl() + '/student/sessions';

  const scheduleCards = d.isRecurringSeriesUpdate && d.seriesSummaryHtml
    ? `<div class="info-card" style="background:#f0fdf4; border-color:#bbf7d0;">
        <h3 style="color:#166534; font-size:15px; margin:0 0 12px 0;">${t(locale, 'em.rescheduleRecurring')}</h3>
        <div style="color:#1f2937; font-size:14px; line-height:1.6;">${d.seriesSummaryHtml}</div>
      </div>`
    : `<div class="info-card" style="background:#eff6ff; border-color:#bfdbfe;">
          <h3 style="color:#1e3a8a; font-size:15px; margin:0 0 12px 0;">${t(locale, 'em.rescheduleOldInfo')}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td(t(locale, 'em.labelOldDate'), d.oldDate)}
            ${td(t(locale, 'em.labelOldTime'), d.oldTime, false)}
          </table>
        </div>
        <div class="info-card" style="background:#f0fdf4; border-color:#bbf7d0; margin-top: 16px;">
          <h3 style="color:#166534; font-size:15px; margin:0 0 12px 0;">${t(locale, 'em.rescheduleNewInfo')}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td(t(locale, 'em.labelNewDate'), d.newDate)}
            ${td(t(locale, 'em.labelNewTime'), d.newTime, false)}
          </table>
        </div>`;

  const disputeNote =
    !wasRescheduledByRecipient && !isOrgAdmin
      ? `<p style="color:#6b7280; font-size:13px; margin-top: 20px;">${t(locale, 'em.disputeNote', { role: isTutorRecipient ? t(locale, 'em.withStudent') : t(locale, 'em.withTutor') })}</p>`
      : isOrgAdmin
        ? `<p style="color:#6b7280; font-size:13px; margin-top: 20px;">${t(locale, 'em.contactOrgOrTutor')}</p>`
        : '';

  return {
    subject: t(locale, 'em.rescheduleSub', { date: d.newDate, time: d.newTime }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#3b82f6', '#2563eb')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.rescheduleHeader')}</h2>
        <p>${headerText}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${messageText}</p>
        ${scheduleCards}
        ${disputeNote}
        <div style="text-align:center; margin-top:20px;">
          ${outlookEmailButton(accountLink, t(locale, 'em.btnGoToAccount'), '#2563eb', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function orgTutorAvailabilityNotice(d: any, locale: Locale) {
  const isNew = d.action === 'created';
  const title = isNew ? t(locale, 'em.availNewTitle') : t(locale, 'em.availUpdatedTitle');
  const lead = isNew
    ? t(locale, 'em.availNewLead')
    : t(locale, 'em.availUpdatedLead');
  return {
    subject: isNew ? t(locale, 'em.availNewSub') : t(locale, 'em.availUpdatedSub'),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#10b981')}">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${title}</h2>
        <p style="color:rgba(255,255,255,0.9); font-size:14px; margin:8px 0 0;">${lead}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.tutorName })}</p>
        <div class="info-card" style="background:#ecfdf5; border-color:#a7f3d0;">
          <p style="color:#1f2937; font-size:14px; line-height:1.6; margin:0;">${d.scheduleSummaryHtml}</p>
        </div>
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${getAppUrl()}/dashboard`, t(locale, 'em.btnOpenCalendar'), '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function dailyDigest(d: any, locale: Locale) {
  return {
    subject: t(locale, 'em.digestSub', { count: String(d.sessionsLength), date: d.dateStr }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#0d9488', '#14b8a6')}">
        <h2 style="color:#fff; font-size:22px; margin:0; font-weight:700;">${t(locale, 'em.digestHeader')}</h2>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${d.dateStr}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.tutorName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.digestBody', { count: String(d.sessionsLength) })}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0; background:#f8f7ff; border:1px solid #e5e3ff; border-radius:12px; overflow:hidden;">
          <thead>
            <tr style="background:#f0eeff;">
              <th style="padding:10px 12px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">${t(locale, 'em.thTime')}</th>
              <th style="padding:10px 12px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">${t(locale, 'em.thStudent')}</th>
              <th style="padding:10px 12px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">${t(locale, 'em.thSubject')}</th>
            </tr>
          </thead>
          <tbody>${d.rowsHTML}</tbody>
        </table>
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${getAppUrl()}/dashboard`, t(locale, 'em.btnOpenCalendar'), '#0d9488', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function waitlistMatchedStudent(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const confirmationLink = d.sessionId ? `${appUrl}/api/confirm-payment?sessionId=${d.sessionId}` : null;
  return {
    subject: t(locale, 'em.waitlistMatchStudentSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.waitlistMatchStudentHeader')}</h2>
        <p>${t(locale, 'em.waitlistMatchStudentHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.waitlistMatchStudentBody', { tutor: d.tutorName })}</p>
        ${table(td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time) + td(t(locale, 'em.labelPriceAlt'), '€' + d.price, false))}
        ${d.bankAccountName ? `
        <div class="info-card" style="background:#f0fdf4; border-color:#bbf7d0; margin-top:16px;">
          <h3 style="color:#166534; font-size:14px; margin:0 0 12px 0; font-weight:700;">${t(locale, 'em.bankDetailsTitle')}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td(t(locale, 'em.labelRecipient'), d.bankAccountName)}
            ${td(t(locale, 'em.labelAccountNo'), d.bankAccountNumber)}
            ${d.paymentPurpose ? td(t(locale, 'em.labelPurpose'), d.paymentPurpose) : ''}
            ${td(t(locale, 'em.labelAmount'), '€' + d.price, false)}
          </table>
        </div>
        ${confirmationLink ? `
        <div style="text-align:center; margin-top:20px;">
          <p style="color:#4b5563; font-size:14px; margin-bottom:12px;">${t(locale, 'em.afterTransfer')}</p>
          ${outlookEmailButton(confirmationLink, t(locale, 'em.btnConfirmPayment'), '#059669', { fontWeight: '600', fontSize: '15px', padding: '14px 36px' })}
        </div>` : ''}
        ` : ''}
        <div style="text-align:center; margin-top:24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnGoToAccount'), '#4f46e5', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function waitlistMatchedTutor(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.waitlistMatchTutorSub', { date: d.date }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${t(locale, 'em.waitlistMatchTutorHeader')}</h1>
        <p>${t(locale, 'em.waitlistMatchTutorHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.tutorName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.waitlistMatchTutorBody', { student: d.studentName })}</p>
        ${table(td(t(locale, 'em.labelStudent'), d.studentName) + td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time, false))}
        <div style="text-align:center; margin-top:30px;">
          ${outlookEmailButton(`${appUrl}/dashboard`, t(locale, 'em.btnViewReservation'), '#4f46e5', { fontWeight: '600', fontSize: '15px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function waitlistAdded(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.waitlistAddedSub') + (d.sessionInfo ? ` – ${d.sessionInfo.startTime}` : ''),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${t(locale, 'em.waitlistAddedHeader')}</h1>
        <p>${t(locale, 'em.waitlistAddedHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.waitlistAddedBody', { tutor: d.tutorName, extra: d.sessionInfo ? t(locale, 'em.waitlistAddedSpecific') : '' })}
        </p>
        ${d.sessionInfo ? `
        <div class="info-card" style="background:#eff6ff; border-color:#bfdbfe;">
          <h3 style="color:#1e40af; font-size:15px; margin:0 0 12px 0; font-weight:700;">${t(locale, 'em.waitlistAddedSessionTitle')}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td(t(locale, 'em.labelSessionTime'), d.sessionInfo.startTime)}
            ${td(t(locale, 'em.labelTopic'), d.sessionInfo.topic, false)}
          </table>
        </div>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin-top:16px;">
          ${t(locale, 'em.waitlistAddedNotify')}
        </p>
        ` : `
        <div class="info-card" style="background:#f0fdf4; border-color:#bbf7d0;">
          <p style="color:#166534; font-size:14px; margin:0; line-height:1.6;">
            ${t(locale, 'em.waitlistHowTitle')}<br/>
            ${t(locale, 'em.waitlistHowBody')}
          </p>
        </div>
        `}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnViewOwnLessons'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function paymentReviewNeeded(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const confirmLink = d.sessionId ? `${appUrl}/api/confirm-payment?sessionId=${d.sessionId}&action=confirm` : null;
  const rejectLink = d.sessionId ? `${appUrl}/api/confirm-payment?sessionId=${d.sessionId}&action=reject` : null;
  return {
    subject: t(locale, 'em.payReviewSub', { student: d.studentName }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#f59e0b', '#d97706')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.payReviewHeader')}</h2>
        <p>${t(locale, 'em.payReviewHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.tutorName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.payReviewBody', { student: d.studentName })}</p>
        ${table(td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time) + (d.price ? td(t(locale, 'em.labelAmount'), '€' + d.price, false) : ''))}
        ${confirmLink && rejectLink ? `
        <div style="text-align:center; margin-top:30px;">
          <p style="color:#4b5563; font-size:14px; margin-bottom:16px;">${t(locale, 'em.receivedTransfer')}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;border-collapse:collapse;"><tr>
            <td style="padding:6px;">${outlookEmailButton(confirmLink, t(locale, 'em.btnYesConfirm'), '#059669', { fontWeight: '600', fontSize: '15px', padding: '14px 28px' })}</td>
            <td style="padding:6px;">${outlookEmailButton(rejectLink, t(locale, 'em.btnNoReject'), '#dc2626', { fontWeight: '600', fontSize: '15px', padding: '14px 28px' })}</td>
          </tr></table>
        </div>` : `
        <div style="text-align:center; margin-top:30px;">
          ${outlookEmailButton(`${appUrl}/dashboard`, t(locale, 'em.btnReviewConfirm'), '#d97706', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}
        </div>`}
        <div style="text-align:center; margin-top:16px;">
          <a href="${appUrl}/dashboard" style="color:#6366f1; text-decoration:none; font-size:13px; font-weight:600;">
            ${t(locale, 'em.btnViewAccount')}
          </a>
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function stripePaymentForwarding(d: any, locale: Locale) {
  const tableBlock = table(
    td(t(locale, 'em.labelDate'), d.date) +
      td(t(locale, 'em.labelTime'), d.time) +
      td(t(locale, 'em.labelPriceAlt'), `€${d.amount}`, false),
  );
  const payBlock = prefersManualInstructions(d)
    ? manualOffPlatformPaymentHtml(d, locale)
    : `<div style="text-align:center; margin-top: 30px;">
          ${outlookEmailButton(String(d.paymentLink), t(locale, 'em.btnPayNow'), '#4f46e5', { fontSize: '16px', padding: '16px 42px' })}
        </div>
        <p style="color:#9ca3af; font-size:12px; text-align:center; margin-top:20px;">${t(locale, 'em.stripeRedirect')}</p>`;
  return {
    subject: t(locale, 'em.stripePaySub', { student: d.studentName, date: d.date }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1 style="color:#ffffff; font-size:24px; margin:0; font-weight:700;">${t(locale, 'em.stripePayHeader')}</h1>
        <p>${t(locale, 'em.stripePayHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.stripePayBody', { student: d.studentName, tutor: d.tutorName })}</p>
        ${tableBlock}
        ${payBlock}
      </div>${footerFor(locale)}`, locale),
  };
}

function paymentAfterLessonReminder(d: any, locale: Locale) {
  const systemIssueNotice = d.systemIssueNotice
    ? `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:12px 14px; margin:0 0 16px 0;">
        <p style="color:#92400e; font-size:13px; line-height:1.5; margin:0;">
          ${d.systemIssueNotice}
        </p>
      </div>`
    : '';
  const payBlock = prefersManualInstructions(d)
    ? manualOffPlatformPaymentHtml(d, locale)
    : `<div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(String(d.paymentLink), t(locale, 'em.btnPayNowArrow'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
        <p style="color:#9ca3af; font-size:12px; text-align:center; margin-top:16px;">${t(locale, 'em.alreadyPaid')}</p>`;
  return {
    subject: t(locale, 'em.afterLessonSub', { tutor: d.tutorName }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h1 style="color:#ffffff; font-size:24px; margin:0; font-weight:700;">${t(locale, 'em.afterLessonHeader')}</h1>
        <p>${t(locale, 'em.afterLessonHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hi')}${d.recipientName ? ', ' + d.recipientName : ''}! 👋</p>
        ${systemIssueNotice}
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.afterLessonBody', { tutor: d.tutorName, studentPart: d.studentName !== (d.recipientName || '') ? t(locale, 'em.afterLessonStudentPart', { student: d.studentName }) : '' })}
        </p>
        ${table(
      td(t(locale, 'em.labelDate'), d.date) +
      td(t(locale, 'em.labelTime'), d.time) +
      td(t(locale, 'em.labelPriceAlt'), `€${d.amount}`, false) +
      td(t(locale, 'em.labelPayBy'), d.payByTime, false)
    )}
        ${payBlock}
      </div>${footerFor(locale)}`, locale),
  };
}

function penaltyPaymentSuccess(d: any, locale: Locale) {
  const fmt = (x: unknown) => (typeof x === 'number' ? x.toFixed(2) : String(x ?? ''));
  const charged =
    d.totalChargedEur != null && Number(d.totalChargedEur) > 0
      ? td(t(locale, 'em.labelTotalCharged'), `€${fmt(Number(d.totalChargedEur))} ${t(locale, 'em.includingFees')}`, false)
      : '';
  return {
    subject: t(locale, 'em.penaltyPaySuccessSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#b45309', '#92400e')}">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${t(locale, 'em.penaltyPaySuccessHeader')}</h2>
        <p>${t(locale, 'em.penaltyPaySuccessHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.penaltyPaySuccessBody', { student: d.studentName, tutor: d.tutorName })}</p>
        ${table(
          td(t(locale, 'em.labelLessonDate'), d.date) +
          td(t(locale, 'em.labelTime'), d.time) +
          (d.duration ? td(t(locale, 'em.labelDuration'), `${d.duration} ${t(locale, 'em.min')}`) : '') +
          td(t(locale, 'em.labelTutor'), d.tutorName) +
          (d.subject ? td(t(locale, 'em.labelSubject'), d.subject) : '') +
          charged
        )}
        <p style="color:#6b7280; font-size:13px; line-height:1.5; margin-top:16px;">${t(locale, 'em.penaltyPaySuccessFooter')}</p>
      </div>${footerFor(locale)}`, locale),
  };
}

function penaltyPaymentTutor(d: any, locale: Locale) {
  const fmt = (x: unknown) => (typeof x === 'number' ? x.toFixed(2) : String(x ?? ''));
  const charged =
    d.totalChargedEur != null && Number(d.totalChargedEur) > 0
      ? td(t(locale, 'em.labelTotalCharged'), `€${fmt(Number(d.totalChargedEur))} ${t(locale, 'em.includingFees')}`, false)
      : '';
  return {
    subject: t(locale, 'em.penaltyPayTutorSub', { student: d.studentName, date: d.date }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#b45309', '#92400e')}">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${t(locale, 'em.penaltyPayTutorHeader')}</h2>
        <p>${t(locale, 'em.penaltyPayTutorHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.penaltyPayTutorBody', { student: d.studentName })}</p>
        ${table(
          td(t(locale, 'em.labelLessonDate'), d.date) +
          td(t(locale, 'em.labelTime'), d.time) +
          (d.subject ? td(t(locale, 'em.labelSubject'), d.subject) : '') +
          charged
        )}
      </div>${footerFor(locale)}`, locale),
  };
}

function paymentSuccess(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const feeText = d.cancellationFeePercent > 0 ? t(locale, 'em.feePercent', { percent: String(d.cancellationFeePercent) }) : t(locale, 'em.freeCancel');
  const cancelText = d.cancellationHours ? t(locale, 'em.cancelBefore', { hours: String(d.cancellationHours), fee: feeText }) : t(locale, 'em.cancelNA');
  const lessonAmt = d.lessonPriceEur ?? d.price;
  const fmt = (x: unknown) => (typeof x === 'number' ? x.toFixed(2) : String(x ?? ''));
  const amountsCloseEuro = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps;
  const lessonNum =
    lessonAmt != null && lessonAmt !== '' && !Number.isNaN(Number(lessonAmt)) ? Number(lessonAmt) : null;
  const chargedNum =
    d.totalChargedEur != null && Number(d.totalChargedEur) > 0 && !Number.isNaN(Number(d.totalChargedEur))
      ? Number(d.totalChargedEur)
      : null;

  let moneyRows = '';
  if (lessonNum != null && chargedNum != null && amountsCloseEuro(lessonNum, chargedNum)) {
    moneyRows = td(t(locale, 'em.labelTotalPaid'), `€${fmt(lessonNum)}`, false);
  } else if (lessonNum != null && chargedNum != null && chargedNum > lessonNum + 0.02) {
    moneyRows =
      td(t(locale, 'em.labelLessonPrice'), `€${fmt(lessonNum)}`) +
      td(t(locale, 'em.labelTotalCharged'), `€${fmt(chargedNum)} ${t(locale, 'em.includingFees')}`, false);
  } else if (lessonNum != null && chargedNum != null && chargedNum < lessonNum - 0.02) {
    moneyRows =
      td(t(locale, 'em.labelLessonPrice'), `€${fmt(lessonNum)}`) +
      td(t(locale, 'em.labelTotalPaid'), `€${fmt(chargedNum)}`, false);
  } else if (lessonNum != null) {
    moneyRows = td(t(locale, 'em.labelLessonPrice'), `€${fmt(lessonNum)}`);
  } else if (chargedNum != null) {
    moneyRows = td(t(locale, 'em.labelTotalCharged'), `€${fmt(chargedNum)} ${t(locale, 'em.includingFees')}`, false);
  } else if (d.price) {
    moneyRows = td(t(locale, 'em.labelPrice'), `€${d.price}`);
  }

  const headerSub = t(locale, 'em.paySuccessHeaderSub');
  const headerSubHtml =
    typeof headerSub === 'string' && headerSub.trim() !== ''
      ? `<p style="margin:0.35em 0 0;">${headerSub}</p>`
      : '';
  return {
    subject: t(locale, 'em.paySuccessSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.paySuccessHeader')}</h2>
        ${headerSubHtml}
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.paySuccessBody', { student: d.studentName, tutor: d.tutorName })}</p>
        ${table(
          td(t(locale, 'em.labelDate'), d.date) + 
          td(t(locale, 'em.labelTime'), d.time) + 
          (d.duration ? td(t(locale, 'em.labelDuration'), `${d.duration} ${t(locale, 'em.min')}`) : '') + 
          td(t(locale, 'em.labelTutor'), d.tutorName) + 
          (d.subject ? td(t(locale, 'em.labelSubject'), d.subject) : '') + 
          moneyRows +
          (d.cancellationHours ? td(t(locale, 'em.labelCancellation'), cancelText) : td(t(locale, 'em.labelStatus'), t(locale, 'em.statusPaid'), false))
        )}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnViewReservation'), '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function lessonConfirmedTutor(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const linkRow = d.meetingLink
    ? td(t(locale, 'em.labelLink'), `<a href="${d.meetingLink}" style="color:#6366f1; word-break:break-all;">${d.meetingLink}</a>`, false)
    : td(t(locale, 'em.labelLink'), t(locale, 'em.joinLinkPlaceholder'), false);
  return {
    subject: t(locale, 'em.lessonConfTutorSub', { student: d.studentName, date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#4f46e5')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.lessonConfTutorHeader')}</h2>
        <p>${t(locale, 'em.lessonConfTutorHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.lessonConfTutorBody', { student: d.studentName })}</p>
        ${table(
          td(t(locale, 'em.labelDate'), d.date) +
          td(t(locale, 'em.labelTime'), d.time) +
          (d.subject ? td(t(locale, 'em.labelSubject'), d.subject) : '') +
          linkRow
        )}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/calendar`, t(locale, 'em.btnOpenCalendar'), '#4f46e5', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function paymentReceivedTutor(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.payReceivedSub', { student: d.studentName, date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.payReceivedHeader')}</h2>
        <p>${t(locale, 'em.payReceivedHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.payReceivedBody', { student: d.studentName })}</p>
        ${table(
          td(t(locale, 'em.labelDate'), d.date) +
          td(t(locale, 'em.labelTime'), d.time) +
          (d.subject ? td(t(locale, 'em.labelSubject'), d.subject) : '') +
          (d.price != null ? td(t(locale, 'em.labelSum'), `€${d.price}`) : '')
        )}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/calendar`, t(locale, 'em.btnOpenCalendar'), '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function paymentFailed(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.payFailedSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#ef4444', '#b91c1c')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.payFailedHeader')}</h2>
        <p>${t(locale, 'em.payFailedHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.payFailedBody', { student: d.studentName, tutor: d.tutorName })}</p>
        ${table(td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time, false))}
        <div style="text-align:center; margin-top: 30px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnPayRetry'), '#dc2626', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function sessionCommentAdded(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.commentSub', { date: d.date }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#3b82f6', '#2563eb')}">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${t(locale, 'em.commentHeader')}</h2>
        <p>${t(locale, 'em.commentHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${t(locale, 'em.commentBody', { tutor: d.tutorName, dateTime: d.date + ' ' + d.time })}</p>
        
        <div style="background:#eff6ff; border: 1px solid #bfdbfe; border-radius:12px; padding:20px; margin:24px 0;">
          <h3 style="color:#1e3a8a; font-size:14px; margin:0 0 10px 0; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">${t(locale, 'em.tutorMessage')}</h3>
          <div style="color:#1e40af; font-size:15px; line-height:1.6; white-space:pre-wrap;">${d.comment}</div>
        </div>
        
        <div style="text-align:center; margin-top: 30px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnViewOnPlatform'), '#2563eb', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

function paymentReminderEmail(d: any, locale: Locale) {
  const timingLt = d.paymentTiming === 'before_lesson' ? t(locale, 'em.payReminderBefore') : t(locale, 'em.payReminderAfter');
  const payBlock = prefersManualInstructions(d)
    ? manualOffPlatformPaymentHtml(d, locale)
    : `<div style="text-align:center; margin: 24px 0;">
          ${outlookEmailButton(String(d.paymentUrl), t(locale, 'em.btnPayNowArrow'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
        <p style="color:#9ca3af; font-size:12px; text-align:center;">
          ${t(locale, 'em.alreadyPaid')}
        </p>`;
  return {
    subject: t(locale, 'em.payReminderSub', { date: d.date, time: d.time }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${t(locale, 'em.payReminderHeader')}</h1>
        <p>${t(locale, 'em.payReminderHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hi')}${d.recipientName ? ', ' + d.recipientName : ''}!</p>
        <p style="color:#374151; font-size:15px;">
          ${d.studentName !== d.recipientName ? t(locale, 'em.payReminderBodyOther', { student: d.studentName, tutor: d.tutorName }) : t(locale, 'em.payReminderBodySelf', { tutor: d.tutorName })}
        </p>
        ${table(
      td(t(locale, 'em.thDate'), d.date) +
      td(t(locale, 'em.thTime'), d.time) +
      td(t(locale, 'em.thPrice'), `€${d.price}`) +
      td(t(locale, 'em.payReminderDeadline'), t(locale, 'em.payReminderTiming', { hours: String(d.deadlineHours), timing: timingLt }), false)
    )}
        <p style="color:#ef4444; font-size:14px; font-weight:600;">
          ${t(locale, 'em.payReminderUrgent')}
        </p>
        ${payBlock}
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function paymentDeadlineWarningTutor(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.deadlineWarnSub', { student: d.studentName }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#f59e0b', '#d97706')}">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${t(locale, 'em.deadlineWarnHeader')}</h2>
        <p style="color:rgba(255,255,255,0.9); margin:8px 0 0; font-size:14px;">${t(locale, 'em.deadlineWarnHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.tutorName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.deadlineWarnBody', { student: d.studentName, detail: d.paymentContext ? '<strong>' + d.paymentContext + '</strong>.' : t(locale, 'em.deadlineWarnDetail', { deadline: d.deadlineTime }) })}
        </p>
        ${table(
      td(t(locale, 'em.labelLessonDate'), d.sessionDate) +
      td(t(locale, 'em.labelLessonTime'), d.sessionTime) +
      td(t(locale, 'em.labelAmountAlt'), `${d.price} €`) +
      (d.paymentContext ? td(t(locale, 'em.labelContext'), d.paymentContext, false) : td(t(locale, 'em.labelPaymentDeadline'), d.deadlineTime, false))
    )}
        <p style="color:#374151; font-size:14px; font-weight:600; margin-top:16px;">${t(locale, 'em.studentContacts')}</p>
        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:16px; margin:8px 0 20px;">
          <p style="margin:4px 0; font-size:14px;">📧 <a href="mailto:${d.studentEmail}" style="color:#d97706;">${d.studentEmail}</a></p>
          ${d.studentPhone ? `<p style="margin:4px 0; font-size:14px;">📱 <a href="tel:${d.studentPhone}" style="color:#d97706;">${d.studentPhone}</a></p>` : ''}
        </div>
        <p style="color:#6b7280; font-size:13px; line-height:1.6;">
          ${t(locale, 'em.contactTutorOrCancel')}
        </p>
        <div style="text-align:center; margin-top:24px;">
          ${outlookEmailButton(`${appUrl}/dashboard`, t(locale, 'em.btnOpenCalendarArrow'), '#d97706', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function paymentDeadlineWarningOrgAdmin(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const detailHtml = d.paymentContext
    ? '<strong>' + d.paymentContext + '</strong>.'
    : t(locale, 'em.deadlineWarnDetail', { deadline: d.deadlineTime });
  return {
    subject: t(locale, 'em.deadlineWarnSub', { student: d.studentName }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#f59e0b', '#d97706')}">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${t(locale, 'em.deadlineWarnHeader')}</h2>
        <p style="color:rgba(255,255,255,0.9); margin:8px 0 0; font-size:14px;">${t(locale, 'em.deadlineWarnHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.deadlineWarnOrgAdminBody', { student: d.studentName, tutor: d.assignedTutorName, detail: detailHtml })}
        </p>
        ${table(
      td(t(locale, 'em.labelLessonDate'), d.sessionDate) +
      td(t(locale, 'em.labelLessonTime'), d.sessionTime) +
      td(t(locale, 'em.labelAmountAlt'), `${d.price} €`, false)
    )}
        <p style="color:#374151; font-size:14px; font-weight:600; margin-top:16px;">${t(locale, 'em.studentContacts')}</p>
        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:16px; margin:8px 0 20px;">
          <p style="margin:4px 0; font-size:14px;">📧 <a href="mailto:${d.studentEmail}" style="color:#d97706;">${d.studentEmail}</a></p>
          ${d.studentPhone ? `<p style="margin:4px 0; font-size:14px;">📱 <a href="tel:${d.studentPhone}" style="color:#d97706;">${d.studentPhone}</a></p>` : ''}
        </div>
        <p style="color:#6b7280; font-size:13px; line-height:1.6;">
          ${t(locale, 'em.deadlineWarnOrgAdminFooter')}
        </p>
        <div style="text-align:center; margin-top:24px;">
          ${outlookEmailButton(`${appUrl}/company/sessions`, t(locale, 'em.btnOpenOrgSessions'), '#d97706', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

// ─── Prepaid Package Emails ──────────────────────────────────────────────────

function prepaidPackageRequest(d: any, locale: Locale) {
  const totalLessonsLabel = d.totalLessons === 1 ? t(locale, 'em.lessonSingular') : d.totalLessons < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  const pricePerLesson = formatMoney(d.pricePerLesson, 'EUR', locale);
  const totalPrice = formatMoney(d.totalPrice, 'EUR', locale);
  const payBlock = prefersManualInstructions(d)
    ? manualOffPlatformPaymentHtml(d, locale)
    : `<div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(String(d.paymentLink), t(locale, 'em.packagePayBtn', { price: totalPrice }), '#7c3aed', { fontSize: '16px', padding: '16px 42px' })}
        </div>
        <p style="color:#9ca3af; font-size:12px; text-align:center; margin-top:16px;">
          ${t(locale, 'em.stripeRedirect')}
        </p>`;
  return {
    subject: t(locale, 'em.packageReqSub', { count: String(d.totalLessons), label: totalLessonsLabel }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#8b5cf6', '#6366f1')}">
        <h1>${t(locale, 'em.packageReqHeader')}</h1>
        <p>${t(locale, 'em.packageReqHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.packageReqBody', { tutor: d.tutorName, studentPart: d.studentName !== d.recipientName ? t(locale, 'em.packageReqStudentPart', { student: d.studentName }) : '' })}
        </p>
        ${table(
          td(t(locale, 'em.labelSubject'), d.subjectName) +
          td(t(locale, 'em.labelLessonCount'), `${d.totalLessons} ${totalLessonsLabel}`) +
          td(t(locale, 'em.labelPricePerLesson'), pricePerLesson) +
          td(t(locale, 'em.labelPayable'), `<strong style="font-size:16px;">${totalPrice}</strong>`, false)
        )}
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:20px 0;">
          <p style="color:#166534; font-size:14px; margin:0; line-height:1.6;">
            ${t(locale, 'em.packageHowTitle')}<br/>
            ${t(locale, 'em.packageHowBody', { count: String(d.totalLessons), subject: d.subjectName, label: d.totalLessons === 1 ? t(locale, 'em.lessonSingular') : d.totalLessons < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany') })}
          </p>
        </div>
        ${payBlock}
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function prepaidPackageSuccess(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const avail = Math.max(0, Number(d.availableLessons) || 0);
  const total = Math.max(0, Number(d.totalLessons) || 0);
  const subj = d.subjectName || '–';
  const availLabel = avail === 1 ? t(locale, 'em.lessonSingular') : avail < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  const totalLabel = total === 1 ? t(locale, 'em.lessonSingular') : total < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  return {
    subject: t(locale, 'em.packageSuccessSub', { count: String(total), label: totalLabel, subject: subj }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h1>${t(locale, 'em.packageSuccessHeader')}</h1>
        <p>${t(locale, 'em.packageSuccessHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.packageSuccessBody', { count: String(avail), subject: subj, label: availLabel })}
        </p>
        ${table(
          td(t(locale, 'em.labelSubject'), subj) +
          td(t(locale, 'em.labelAvailable'), `${avail}/${total}`) +
          td(t(locale, 'em.labelTotalPaid'), `€${d.totalPrice}`, false)
        )}
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:16px; margin:20px 0;">
          <p style="color:#1e40af; font-size:14px; margin:0; line-height:1.6;">
            ${t(locale, 'em.packageUseTitle')}<br/>
            ${t(locale, 'em.packageUseBody', { subject: subj, available: String(avail), total: String(total) })}
          </p>
        </div>
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnRegisterLesson'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function packageDepletedNotification(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.packageDepletedSub', { student: d.studentName }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#f59e0b', '#d97706')}">
        <h1>${t(locale, 'em.packageDepletedHeader')}</h1>
        <p>${t(locale, 'em.packageDepletedHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.tutorName || t(locale, 'em.roleAdmin') })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.packageDepletedBody', { student: d.studentName, subject: d.subjectName })}
        </p>
        ${table(
          td(t(locale, 'em.labelStudentAlt'), d.studentName) +
          td(t(locale, 'em.labelSubject'), d.subjectName) +
          td(t(locale, 'em.labelPackageSize'), `${d.totalLessons || 0} ${t(locale, 'em.lessonsOf')}`, false)
        )}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/company/students`, t(locale, 'em.btnSendNewPackage'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

// ─── Monthly Billing Emails ──────────────────────────────────────────────────

function monthlyInvoice(d: any, locale: Locale) {
  // d.sessions = array of { date, time, subject, price }
  const sessionsHtml = d.sessions && Array.isArray(d.sessions)
    ? d.sessions.map((s: any) => `
        <tr style="border-bottom:1px solid #f0eeff;">
          <td style="padding:12px 8px; color:#374151; font-size:14px;">${s.date}</td>
          <td style="padding:12px 8px; color:#374151; font-size:14px;">${s.time}</td>
          <td style="padding:12px 8px; color:#374151; font-size:14px;">${s.subject || '–'}</td>
          <td style="padding:12px 8px; color:#1f2937; font-size:14px; font-weight:600; text-align:right;">€${s.price}</td>
        </tr>
      `).join('')
    : '';

  return {
    subject: t(locale, 'em.invoiceSub', { period: d.periodText, amount: d.totalAmount }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${t(locale, 'em.invoiceHeader')}</h1>
        <p>${t(locale, 'em.invoiceHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.invoiceBody', { tutor: d.tutorName, period: d.periodText, studentPart: d.studentName !== d.recipientName ? t(locale, 'em.invoiceStudentPart', { student: d.studentName }) : '' })}
        </p>

        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:16px; margin:20px 0;">
          <h3 style="color:#1e40af; font-size:15px; margin:0 0 12px 0; font-weight:700;">${t(locale, 'em.invoiceListTitle')}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr style="background:#dbeafe; border-bottom:2px solid #bfdbfe;">
                <th style="padding:10px 8px; text-align:left; font-size:13px; color:#1e40af; font-weight:600;">${t(locale, 'em.thDate')}</th>
                <th style="padding:10px 8px; text-align:left; font-size:13px; color:#1e40af; font-weight:600;">${t(locale, 'em.thTime')}</th>
                <th style="padding:10px 8px; text-align:left; font-size:13px; color:#1e40af; font-weight:600;">${t(locale, 'em.thSubject')}</th>
                <th style="padding:10px 8px; text-align:right; font-size:13px; color:#1e40af; font-weight:600;">${t(locale, 'em.thPrice')}</th>
              </tr>
            </thead>
            <tbody>${sessionsHtml}</tbody>
            <tfoot>
              <tr style="background:#f0f9ff;">
                <td colspan="3" style="padding:14px 8px; color:#1e40af; font-size:15px; font-weight:700; text-align:right;">${t(locale, 'em.totalLabel')}</td>
                <td style="padding:14px 8px; color:#1e40af; font-size:16px; font-weight:800; text-align:right;">€${d.totalAmount}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${d.paymentDeadline ? `
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px; margin:20px 0;">
          <p style="color:#991b1b; font-size:14px; margin:0; font-weight:600;">
            ${t(locale, 'em.payDeadline', { date: d.paymentDeadline })}
          </p>
        </div>
        ` : ''}

        ${
          prefersManualInstructions(d)
            ? manualOffPlatformPaymentHtml(d, locale)
            : `<div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(String(d.paymentLink), t(locale, 'em.invoicePayBtn', { amount: d.totalAmount }), '#4f46e5', { fontSize: '16px', padding: '16px 42px' })}
        </div>
        <p style="color:#9ca3af; font-size:12px; text-align:center; margin-top:16px;">
          ${t(locale, 'em.stripeRedirect')}
        </p>`
        }
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function manualPackageRequest(d: any, locale: Locale) {
  const totalLessonsLabel = d.totalLessons === 1 ? t(locale, 'em.lessonSingular') : d.totalLessons < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  const pricePerLesson = formatMoney(d.pricePerLesson, 'EUR', locale);
  const totalPrice = formatMoney(d.totalPrice, 'EUR', locale);
  const paymentUrl = typeof d.paymentUrl === 'string' && d.paymentUrl.trim().length > 0 ? String(d.paymentUrl).trim() : '';
  return {
    subject: t(locale, 'em.manualPkgSub', { count: String(d.totalLessons), label: totalLessonsLabel, subject: d.subjectName }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#8b5cf6', '#6366f1')}">
        <h1>${t(locale, 'em.manualPkgHeader')}</h1>
        <p>${t(locale, 'em.manualPkgHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.manualPkgBody', { student: d.studentName, org: d.orgName })}
        </p>
        ${table(
          td(t(locale, 'em.labelSubject'), d.subjectName) +
          td(t(locale, 'em.labelLessonCount'), `${d.totalLessons} ${totalLessonsLabel}`) +
          td(t(locale, 'em.labelPricePerLesson'), pricePerLesson) +
          td(t(locale, 'em.labelPayable'), `<strong style="font-size:16px;">${totalPrice}</strong>`, false)
        )}
        ${
          typeof d.bankDetails === 'string' && d.bankDetails.trim().length > 0
            ? `<div style="background:#fefce8; border:1px solid #fde047; border-radius:12px; padding:16px; margin:16px 0;">
          <p style="color:#854d0e; font-size:13px; font-weight:700; margin:0 0 10px;">${esc(t(locale, 'em.manualPkgBankHeading'))}</p>
          <pre style="color:#713f12; font-size:14px; margin:0; white-space:pre-wrap; font-family:ui-monospace,Menlo,Consolas,monospace; line-height:1.55;">${esc(d.bankDetails.trim())}</pre>
        </div>`
            : ''
        }
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:20px 0;">
          <p style="color:#166534; font-size:14px; margin:0; line-height:1.6;">
            ${t(locale, 'em.manualPkgHowTitle')}<br/>
            ${t(locale, 'em.manualPkgHowBody', { price: totalPrice, org: d.orgName })}
            ${paymentUrl
              ? ` ${t(locale, 'em.manualPkgUseLink')}`
              : ` ${t(locale, 'em.manualPkgContactOrg')}`}
            ${t(locale, 'em.manualPkgActivation')}
          </p>
        </div>
        ${paymentUrl
          ? `<div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(paymentUrl, t(locale, 'em.btnGoToPayment'), '#7c3aed', { fontSize: '16px', padding: '16px 42px' })}
        </div>`
          : ''}
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function manualPackageConfirmed(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const availableLessons = Math.max(0, Number(d.availableLessons) || 0);
  const totalLessons = Math.max(0, Number(d.totalLessons) || 0);
  const lessonsLabel = availableLessons === 1 ? t(locale, 'em.lessonSingular') : availableLessons < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  return {
    subject: t(locale, 'em.manualPkgConfSub', { student: d.studentName, count: String(availableLessons), label: lessonsLabel }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h1>${t(locale, 'em.manualPkgConfHeader')}</h1>
        <p>${t(locale, 'em.manualPkgConfHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.manualPkgConfBody', { student: d.studentName })}
        </p>
        ${table(
          td(t(locale, 'em.labelSubject'), d.subjectName || '–') +
          td(t(locale, 'em.labelRemaining'), `${availableLessons}/${totalLessons}`) +
          td(t(locale, 'em.labelTotalPaid'), `€${d.totalPrice}`, false)
        )}
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:16px; margin:20px 0;">
          <p style="color:#1e40af; font-size:14px; margin:0; line-height:1.6;">
            ${t(locale, 'em.manualPkgNextTitle')}<br/>
            ${t(locale, 'em.manualPkgNextBody', { available: String(availableLessons), total: String(totalLessons) })}
          </p>
        </div>
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnViewLessonsArrow'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function monthlyInvoicePaid(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: t(locale, 'em.invoicePaidSub', { period: d.periodText, amount: d.totalAmount }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h1>${t(locale, 'em.invoicePaidHeader')}</h1>
        <p>${t(locale, 'em.invoicePaidHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.invoicePaidBody', { period: d.periodText })}
        </p>
        ${table(
          td(t(locale, 'em.labelPeriod'), d.periodText) +
          td(t(locale, 'em.labelLessonCount'), d.sessionsCount) +
          td(t(locale, 'em.labelSum'), `€${d.totalAmount}`, false)
        )}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnViewLessonsArrow'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function chatNewMessage(d: any, locale: Locale) {
  const url = typeof d.messagesUrl === 'string' && d.messagesUrl.startsWith('http') ? d.messagesUrl : `${getAppUrl()}/messages`;
  return {
    subject: t(locale, 'em.chatNewMsgSub', { sender: d.senderName || '' }),
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${t(locale, 'em.chatNewMsgHeader')}</h1>
        <p>${t(locale, 'em.chatNewMsgHeaderSub', { sender: d.senderName || '' })}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName || '' })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.chatNewMsgBody')}
        </p>
        <p style="color:#1f2937; font-size:14px; line-height:1.5; margin:16px 0; padding:12px 14px; background:#f3f4f6; border-radius:12px;">
          ${d.preview || '…'}
        </p>
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(url, t(locale, 'em.chatNewMsgBtn'), '#4f46e5', { fontWeight: '600', fontSize: '15px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`,
      locale,
    ),
  };
}

function chatMessageDigest(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const unreadLabel = d.unreadCount === 1
    ? t(locale, 'em.chatDigestUnreadOne')
    : t(locale, 'em.chatDigestUnreadMany', { count: String(d.unreadCount) });
  return {
    subject: t(locale, 'em.chatDigestSub', { count: String(d.unreadCount) }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${t(locale, 'em.chatDigestHeader')}</h1>
        <p>${t(locale, 'em.chatDigestHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName || '' })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.chatDigestBody', { label: unreadLabel, senders: d.senderNames || t(locale, 'em.chatDigestDefaultSender') })}
        </p>
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/messages`, t(locale, 'em.chatDigestBtn'), '#4f46e5', { fontWeight: '600', fontSize: '15px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolContract(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const missingFields: string[] = Array.isArray(d.missingFields)
    ? d.missingFields.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const completionLink = missingFields.length > 0
    ? String(
        d.completionUrl ||
        (d.contractId
          ? `${appUrl.replace(/\/$/, '')}/school-contract-complete?contractId=${encodeURIComponent(String(d.contractId))}`
          : ''),
      ).trim()
    : '';
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
  return {
    subject: `Metinio mokescio sutartis${d.contractNumber ? ` Nr. ${d.contractNumber}` : ''} — ${d.studentName || 'Mokinys'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Metinio mokesčio sutartis</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(d.recipientName || d.parentName || d.studentName)},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Prašome peržiūrėti metinio mokesčio sutartį mokiniui <strong>${esc(d.studentName)}</strong> (${esc(d.schoolName)}).
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Sutarties Nr.', esc(d.contractNumber || '—'))}
            ${td('Mokinys', esc(d.studentName))}
            ${td('Metinis mokestis', d.annualFee ? `€${d.annualFee}` : '—')}
            ${td('Tėvų telefonas', esc(d.parentPhone || '—'))}
            ${td('Vaiko gimimo data', esc(d.childBirthDate || '—'))}
            ${td('Adresas', esc(d.address || '—'))}
            ${td('Data', d.date || new Date().toLocaleDateString('lt-LT'), false)}
          </table>
        </div>
        ${d.contractBody ? '' : ''}
        ${missingFieldsHtml}
        ${d.pdfUrl ? `<div style="margin:16px 0 10px;">${outlookEmailButton(d.pdfUrl, 'Atidaryti PDF sutartį', '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 24px' })}</div>` : ''}
        ${missingFields.length > 0 && completionLink ? `<div style="margin:0 0 20px;">${outlookEmailButton(completionLink, 'Papildyti trūkstamus duomenis', '#2563eb', { fontWeight: '600', fontSize: '14px', padding: '12px 24px' })}</div>` : ''}
        <p style="color:#6b7280; font-size:13px;">Jei turite klausimų, susisiekite su mokykla: ${esc(d.schoolEmail || '')}.</p>
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolInstallmentRequest(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  return {
    subject: `Mokėjimo prašymas — įmoka #${d.installmentNumber || ''}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Mokėjimo prašymas</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(d.recipientName || d.parentName || d.studentName)},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Atėjo laikas apmokėti <strong>${esc(d.studentName)}</strong> metinio mokesčio įmoką (${esc(d.schoolName)}).
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Mokinys', esc(d.studentName))}
            ${td('Įmoka', `#${d.installmentNumber || '—'} iš ${d.totalInstallments || '—'}`)}
            ${td('Suma', d.amount ? `€${d.amount}` : '—')}
            ${td('Terminas', d.dueDate || '—', false)}
          </table>
        </div>
        ${d.paymentUrl ? `<div style="text-align:center; margin:24px 0;">${outlookEmailButton(d.paymentUrl, 'Apmokėti dabar', '#059669', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}</div>` : `<p style="color:#4b5563; font-size:14px; line-height:1.6; margin:16px 0 0;">Kortele apmokėti galėsite nuoroda, kurią mokykla atsiųs atskirai (kai bus sukonfigūruotas mokėjimas), arba sutarkite mokėjimo būdą tiesiogiai su mokykla.</p>`}
        <p style="color:#6b7280; font-size:13px;">Jei turite klausimų, susisiekite su mokykla: ${esc(d.schoolEmail || '')}.</p>
      </div>${footerFor(locale)}`, locale),
  };
}

function productUpdateSfAndChat(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const title = locale === 'en' ? 'Updates in Tutlio' : 'Naujienos Tutlio sistemoje';
  const subject = locale === 'en'
    ? 'Tutlio updates: invoices + messaging'
    : 'Tutlio naujienos: sąskaitos faktūros + susirašinėjimas';
  const intro = locale === 'en'
    ? 'These updates are already live in Tutlio — they should make your day-to-day work a bit easier.'
    : 'Šiuos atnaujinimus jau įdiegėme platformoje – turėtų būti patogiau dirbti kasdien.';
  const bullets = locale === 'en'
    ? [
        'Improved sales invoices (S.F.)',
        'New messaging channels (student ↔ tutor communication)',
      ]
    : [
        'Atnaujinome sąskaitų faktūrų (S.F.) išrašymą',
        'Įdiegėme naujus susirašinėjimo kanalus (mokinio ↔ korepetitoriaus komunikacija)',
      ];
  const closing = locale === 'en'
    ? `We’re really happy you’re using Tutlio. If you have any questions or something is unclear, feel free to email us at <a href="mailto:info@tutlio.lt" style="color:#4f46e5; font-weight:700; text-decoration:none;">info@tutlio.lt</a>.`
    : `Labai džiaugiamės, kad naudojatės Tutlio. Jei kyla klausimų ar neaiškumų – drąsiai rašykite mums į <a href="mailto:info@tutlio.lt" style="color:#4f46e5; font-weight:700; text-decoration:none;">info@tutlio.lt</a>.`;

  return {
    subject,
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${title}</h1>
        <p>${esc(d?.subtitle || '')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:0 0 14px;">${intro}</p>
        <div class="info-card">
          <ul style="margin:0; padding-left:18px; color:#1f2937; font-size:14px; line-height:1.65;">
            ${bullets.map(b => `<li style="margin:6px 0;">${b}</li>`).join('')}
          </ul>
        </div>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:14px 0 0;">${closing}</p>
        <div style="text-align:center; margin-top: 22px;">
          ${outlookEmailButton(`${appUrl}/dashboard`, locale === 'en' ? 'Open Tutlio' : 'Atidaryti Tutlio', '#4f46e5', { fontWeight: '700', fontSize: '15px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`,
      locale,
    ),
  };
}

/** Vidinis HTML (be išorinio wrap) – bodyHtml neescapinamas (tik serverio generuotas turinys). */
function customHtmlAnnouncement(d: any, locale: Locale) {
  if (!d?.subject || typeof d.subject !== 'string') {
    throw new Error('custom_html_announcement: missing data.subject');
  }
  if (!d?.bodyHtml || typeof d.bodyHtml !== 'string') {
    throw new Error('custom_html_announcement: missing data.bodyHtml');
  }
  return {
    subject: String(d.subject),
    html: wrap(
      `<div class="body" style="padding:20px 24px;">
        ${d.bodyHtml}
      </div>${footerFor(locale)}`,
      locale,
    ),
  };
}

function isAuthorizedRequest(req: VercelRequest): boolean {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const internalKey = typeof req.headers['x-internal-key'] === 'string' ? req.headers['x-internal-key'] : '';
  if (internalKey && serviceKey && internalKey === serviceKey) return true;

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

async function isAuthenticatedUser(req: VercelRequest): Promise<boolean> {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await sb.auth.getUser(token);
  return !error;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!isAuthorizedRequest(req) && !(await isAuthenticatedUser(req))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, to, data: rawData } = req.body;
    if (!type || !to) {
      return res.status(400).json({ error: 'Missing required fields: type, to' });
    }
    const apiKey = process.env.RESEND_API_KEY_STAGE || process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[send-email] RESEND_API_KEY not set');
      return res.status(503).json({ error: 'Email service not configured' });
    }

    if (type === 'school_contract') {
      const missingFields = Array.isArray(rawData?.missingFields)
        ? rawData.missingFields.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      const hasCompletionUrl = typeof rawData?.completionUrl === 'string' && rawData.completionUrl.trim().length > 0;
      const contractId = typeof rawData?.contractId === 'string' ? rawData.contractId : '';
      if (!hasCompletionUrl && missingFields.length > 0 && contractId) {
        const generated = await createSchoolCompletionUrl(contractId, req);
        if (generated) rawData.completionUrl = generated;
      }
    }

    const data = sanitizeEmailData(rawData);

    function tutorStudentAssigned(d: any, locale: Locale) {
      const hasEmail = d.studentEmail && String(d.studentEmail).trim() !== '';
      const hasPhone = d.studentPhone && String(d.studentPhone).trim() !== '';
      const contactRows = [
        hasEmail ? td(locale === 'lt' ? 'El. paštas' : 'Email', esc(d.studentEmail), hasPhone) : '',
        hasPhone ? td(locale === 'lt' ? 'Telefonas' : 'Phone', esc(d.studentPhone), false) : '',
      ].join('');
      const contactBlock = contactRows
        ? `<div class="info-card"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${contactRows}</table></div>`
        : `<p style="color:#4b5563; font-size:14px; line-height:1.6;">${
            locale === 'lt'
              ? 'Dėl pamokų ir bendravimo su mokiniu naudokitės Tutlio platforma (pvz., mokinių puslapis ar žinutės).'
              : 'For lessons and communicating with the student, use Tutlio (e.g. Students page or messages).'
          }</p>`;
      return {
        subject: locale === 'lt' ? `Naujas mokinys priskirtas jums` : `New student assigned to you`,
        html: wrap(`
          <div class="header" style="${headerInlineStyle('#6366f1', '#4f46e5')}">
            <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">${locale === 'lt' ? 'Naujas mokinys' : 'New Student'}</h1>
          </div>
          <div class="body">
            <p class="greeting">${locale === 'lt' ? 'Sveiki' : 'Hello'}, ${esc(d.tutorName || '')},</p>
            <p style="color:#4b5563; font-size:14px; line-height:1.6;">
              ${locale === 'lt'
                ? `Jums buvo priskirtas naujas mokinys: <strong>${esc(d.studentName || '')}</strong>.`
                : `A new student has been assigned to you: <strong>${esc(d.studentName || '')}</strong>.`}
            </p>
            ${contactBlock}
          </div>${footerFor(locale)}`, locale),
      };
    }

    function parentInvite(d: any, locale: Locale) {
      return {
        subject: locale === 'lt' ? `Pakvietimas sukurti tėvų paskyrą – Tutlio` : `Invitation to create a parent account – Tutlio`,
        html: wrap(`
          <div class="header" style="${headerInlineStyle('#7c3aed', '#6d28d9')}">
            <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">${locale === 'lt' ? 'Tėvų paskyra' : 'Parent Account'}</h1>
          </div>
          <div class="body">
            <p class="greeting">${locale === 'lt' ? 'Sveiki' : 'Hello'}${d.parentName ? `, ${esc(d.parentName)}` : ''},</p>
            <p style="color:#4b5563; font-size:14px; line-height:1.6;">
              ${locale === 'lt'
                ? `Jūsų vaikas <strong>${esc(d.studentName || '')}</strong> sukūrė paskyrą Tutlio platformoje ir pakvietė jus susikurti tėvų paskyrą.`
                : `Your child <strong>${esc(d.studentName || '')}</strong> has created an account on Tutlio and invited you to create a parent account.`}
            </p>
            <p style="color:#4b5563; font-size:14px; line-height:1.6;">
              ${locale === 'lt'
                ? 'Su tėvų paskyra galėsite matyti pamokas, sąskaitas ir bendrauti su korepetitoriais.'
                : 'With a parent account, you can view lessons, invoices, and communicate with tutors.'}
            </p>
            <div style="text-align:center; margin:24px 0;">
              <a href="${esc(d.registerLink || '')}" style="display:inline-block; background:#7c3aed; color:#fff; font-weight:700; font-size:15px; padding:14px 36px; border-radius:12px; text-decoration:none;">
                ${locale === 'lt' ? 'Sukurti paskyrą' : 'Create Account'}
              </a>
            </div>
            ${d.code ? `
            <p style="color:#4b5563; font-size:14px; line-height:1.6; text-align:center;">
              ${locale === 'lt'
                ? `Arba atverkite <strong>tutlio.lt/parent-register</strong> ir įveskite kodą: <strong style="letter-spacing:2px;">${esc(String(d.code))}</strong>`
                : `Or open <strong>tutlio.lt/parent-register</strong> and enter code: <strong style="letter-spacing:2px;">${esc(String(d.code))}</strong>`}
            </p>` : ''}
          </div>${footerFor(locale)}`, locale),
      };
    }

    const locale: Locale = 'lt';

    // Resolve org branding for whitelabel emails
    let orgBranding: EmailBranding | null = null;
    const orgIdForBranding = data.organizationId || data.organization_id || null;
    if (orgIdForBranding) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (supabaseUrl && serviceKey) {
          const sb = createClient(supabaseUrl, serviceKey);
          const { data: org } = await sb
            .from('organizations')
            .select('name, logo_url, brand_color, features')
            .eq('id', orgIdForBranding)
            .maybeSingle();
          if (org) {
            const features = (org.features && typeof org.features === 'object' ? org.features : {}) as Record<string, unknown>;
            if (features.custom_branding && org.logo_url) {
              orgBranding = { name: org.name, logo_url: org.logo_url, brand_color: org.brand_color || '#6366f1' };
            }
          }
        }
      } catch {}
    }

    // Patch the email HTML post-generation to inject org branding into the wrap() header
    function applyBranding(result: { subject: string; html: string }): { subject: string; html: string } {
      if (!orgBranding) return result;
      const logoHtml = orgBranding.logo_url
        ? `<img src="${orgBranding.logo_url}" alt="${escapeHtml(orgBranding.name)}" style="max-height:36px;max-width:160px;" />`
        : `<span style="font-size:26px;font-weight:900;color:${orgBranding.brand_color};letter-spacing:-0.5px;">${escapeHtml(orgBranding.name)}</span>`;
      const poweredBy = `<p style="color:#9ca3af;font-size:11px;margin:8px 0 0;">powered by Tutlio</p>`;
      const defaultHeader = `<span style="font-size:26px;font-weight:900;color:#4f46e5;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>`;
      const branded = result.html.replace(defaultHeader, `${logoHtml}${poweredBy}`);
      return { subject: result.subject, html: branded };
    }

    let emailContent: { subject: string; html: string };
    switch (type) {
      case 'booking_confirmation': emailContent = bookingConfirmation(data, locale); break;
      case 'booking_notification': emailContent = bookingNotification(data, locale); break;
      case 'session_cancelled': emailContent = sessionCancelled(data, locale); break;
      case 'session_cancelled_parent': emailContent = sessionCancelledParent(data, locale); break;
      case 'session_student_no_show': emailContent = sessionStudentNoShowPayer(data, locale); break;
      case 'session_reminder': emailContent = sessionReminder(data, locale); break;
      case 'session_reminder_payer': emailContent = sessionReminderPayer(data, locale); break;
      case 'payment_rejection_reminder': emailContent = paymentRejectionReminder(data, locale); break;
      case 'invite_email': emailContent = inviteEmail(data, locale); break;
      case 'recurring_booking_confirmation': emailContent = recurringBookingConfirmation(data, locale); break;
      case 'tutor_invite': emailContent = tutorInvite(data, locale); break;
      case 'lesson_rescheduled': emailContent = lessonRescheduled(data, locale); break;
      case 'waitlist_added': emailContent = waitlistAdded(data, locale); break;
      case 'waitlist_matched_student': emailContent = waitlistMatchedStudent(data, locale); break;
      case 'waitlist_matched_tutor': emailContent = waitlistMatchedTutor(data, locale); break;
      case 'payment_review_needed': emailContent = paymentReviewNeeded(data, locale); break;
      case 'daily_digest': emailContent = dailyDigest(data, locale); break;
      case 'payment_reminder': emailContent = paymentReminderEmail(data, locale); break;
      case 'payment_deadline_warning_tutor': emailContent = paymentDeadlineWarningTutor(data, locale); break;
      case 'payment_deadline_warning_org_admin': emailContent = paymentDeadlineWarningOrgAdmin(data, locale); break;
      case 'stripe_payment_forwarding': emailContent = stripePaymentForwarding(data, locale); break;
      case 'payment_after_lesson_reminder': emailContent = paymentAfterLessonReminder(data, locale); break;
      case 'payment_success': emailContent = paymentSuccess(data, locale); break;
      case 'penalty_payment_success': emailContent = penaltyPaymentSuccess(data, locale); break;
      case 'penalty_payment_tutor': emailContent = penaltyPaymentTutor(data, locale); break;
      case 'lesson_confirmed_tutor': emailContent = lessonConfirmedTutor(data, locale); break;
      case 'payment_received_tutor': emailContent = paymentReceivedTutor(data, locale); break;
      case 'payment_failed': emailContent = paymentFailed(data, locale); break;
      case 'session_comment_added': emailContent = sessionCommentAdded(data, locale); break;
      case 'prepaid_package_request': emailContent = prepaidPackageRequest(data, locale); break;
      case 'prepaid_package_success': emailContent = prepaidPackageSuccess(data, locale); break;
      case 'package_depleted_notification': emailContent = packageDepletedNotification(data, locale); break;
      case 'monthly_invoice': emailContent = monthlyInvoice(data, locale); break;
      case 'monthly_invoice_paid': emailContent = monthlyInvoicePaid(data, locale); break;
      case 'manual_package_request': emailContent = manualPackageRequest(data, locale); break;
      case 'manual_package_confirmed': emailContent = manualPackageConfirmed(data, locale); break;
      case 'org_tutor_availability_notice': emailContent = orgTutorAvailabilityNotice(data, locale); break;
      case 'chat_new_message': emailContent = chatNewMessage(data, locale); break;
      case 'chat_message_digest': emailContent = chatMessageDigest(data, locale); break;
      case 'product_update_sf_chat': emailContent = productUpdateSfAndChat(data, locale); break;
      case 'custom_html_announcement': emailContent = customHtmlAnnouncement(data, locale); break;
      case 'school_contract': emailContent = schoolContract(data, locale); break;
      case 'school_installment_request': emailContent = schoolInstallmentRequest(data, locale); break;
      case 'tutor_student_assigned': emailContent = tutorStudentAssigned(data, locale); break;
      case 'parent_invite': emailContent = parentInvite(data, locale); break;
      default: return res.status(400).json({ error: `Unknown email type: ${type}` });
    }

    emailContent = applyBranding(emailContent);

    const emailPayload: Parameters<typeof resend.emails.send>[0] = {
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject: unescapeHtml(emailContent.subject),
      html: emailContent.html,
    };

    const rawAttachments = (req.body as any)?.attachments;
    if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
      emailPayload.attachments = rawAttachments.map((a: any) => ({
        filename: a.filename || 'document.pdf',
        content: Buffer.from(a.content, 'base64'),
      }));
    }

    const { data: result, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('[send-email] Resend error:', error);
      const msg = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : 'Failed to send email';
      return res.status(500).json({ error: msg });
    }

    // Chat push siunčiamas iš /api/chat-notify-on-message (pagal user_id, nepriklausomai nuo el. throttling).
    if (type !== 'chat_new_message') {
      sendPushForEmail(Array.isArray(to) ? to : [to], type, rawData).catch((e) =>
        console.error('[send-email] push error:', e?.message || e),
      );
    }

    return res.status(200).json({ success: true, id: result?.id });
  } catch (err: any) {
    console.error('[send-email] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
