// ─── Vercel Serverless Function: Send Email via Resend ───────────────────────
// POST /api/send-email
// Body: { type, to, data }
// All templates are inlined to avoid Vercel module resolution issues.

if (typeof process !== 'undefined' && process.env.TUTLIO_DEV_API_LOCAL === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import type { VercelRequest, VercelResponse } from './types';
import { t, isValidLocale, localizedFromEmail, type Locale } from './_lib/i18n.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import {
  applyOrgBrandingToHtml,
  resolveEmailOrgBranding,
  type EmailBranding,
} from './_lib/emailOrgBranding.js';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { outlookEmailButton, headerInlineStyle } from './_lib/outlookEmail.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { SCHOOL_CONTRACTS_BUCKET, extractSchoolContractStoragePath } from './_lib/schoolContractPdfPath.js';
import { sendPushForEmail } from './_lib/sendPush.js';
import { getResendApiKey, resendNotConfiguredMessage } from './_lib/resendConfig.js';
import { buildTrackedJoinUrl, type JoinRole } from './_lib/joinLink.js';
import { isInternalRequest } from './_lib/auth.js';
import { isCronAuthorized } from './_lib/cronAuth.js';
import { markdownToEmailHtml } from './_lib/blogMarkdownEmail.js';
import { canonicalOriginForOrgLocale } from './_lib/public-origin.js';
import { schoolInstallmentPaymentBreakdown } from './_lib/schoolBookingInvite.js';
import { studentRegistrationAlreadyActive } from './_lib/registrationInviteGate.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission, type OrgAdminPermission } from '../src/lib/orgAdminPermissions.js';


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

/**
 * The `school-contracts` bucket is private, so the stored public URL won't open
 * from an email. Mint a long-lived signed URL (service role) for the recipient.
 * Returns the value untouched if it is an external URL, or null if signing fails
 * (caller drops the broken link).
 */
async function signSchoolContractPdfUrl(urlOrPath: unknown): Promise<string | null> {
  const value = typeof urlOrPath === 'string' ? urlOrPath.trim() : '';
  if (!value) return null;
  const path = extractSchoolContractStoragePath(value);
  // No bucket marker and an absolute URL → external template, leave as-is.
  if (path === value && /^https?:\/\//i.test(value)) return value;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 14); // 14 days (matches completion-token lifetime)
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function escapeHtml(unsafe: unknown): string {
  // Idempotent: only encode an `&` that is NOT already the start of a valid HTML
  // entity. Values pass through two escape layers — sanitizeEmailData() at the
  // request boundary and esc() again inside templates — so a naive `&` → `&amp;`
  // double-encodes (e.g. a school name `… vaikai"` becomes `&amp;quot;`, which
  // renders as the literal text `&quot;`). The `<`, `>`, `"`, `'` rules below have
  // no such exemption, so dangerous characters are still always escaped.
  return String(unsafe ?? '')
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function esc(value: unknown): string {
  return escapeHtml(value);
}

/** Parent-facing "questions?" contact in school payment / contract emails. */
function schoolParentContactEmail(d: { contactEmail?: unknown; schoolEmail?: unknown }): string {
  const contact = String(d.contactEmail || '').trim();
  if (contact) return contact;
  return String(d.schoolEmail || '').trim();
}

function schoolStudentSubjectSuffix(studentName: unknown): string {
  const name = String(studentName || '').trim();
  return name ? ` (${name})` : '';
}

function schoolInstallmentEmailSubject(
  d: { studentName?: unknown; installmentNumber?: unknown },
  locale: Locale,
): string {
  const suffix = schoolStudentSubjectSuffix(d.studentName);
  const installmentLabel =
    d.installmentNumber != null && d.installmentNumber !== ''
      ? ` — įmoka #${d.installmentNumber}`
      : '';
  return locale === 'lt'
    ? `Ugdymo šeimoje${installmentLabel}${suffix}`
    : `Home education${installmentLabel}${suffix}`;
}

function schoolContractFeeEmailSubject(d: { studentName?: unknown }, locale: Locale): string {
  const suffix = schoolStudentSubjectSuffix(d.studentName);
  return locale === 'lt'
    ? `Ugdymo šeimoje — sutarties mokestis${suffix}`
    : `Home education — contract fee${suffix}`;
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

/** Which attendance side the email recipient represents (parent/payer counts as the student side). */
function joinRoleForEmailType(type: string, d: any): JoinRole | null {
  switch (type) {
    case 'booking_confirmation':
    case 'session_reminder_payer':
      return 'student';
    case 'session_reminder':
      return d?.isTutor ? 'tutor' : 'student';
    case 'lesson_confirmed_tutor':
      return 'tutor';
    default:
      return null;
  }
}

/**
 * Attendance tracking: lesson join links in emails go through /api/join-session
 * (records the click, then redirects to the real Zoom/Meet link). Applied only
 * when the caller provides `sessionId`; otherwise the raw link is kept.
 */
function applyTrackedMeetingLink(type: string, d: any): void {
  const rawLink = typeof d?.meetingLink === 'string' ? d.meetingLink.trim() : '';
  const sessionId = typeof d?.sessionId === 'string' ? d.sessionId.trim() : '';
  if (!rawLink || !sessionId || rawLink.includes('/api/join-session')) return;
  const role = joinRoleForEmailType(type, d);
  if (!role) return;
  try {
    d.meetingLink = buildTrackedJoinUrl(getAppUrl(), sessionId, role);
  } catch {
    // No HMAC secret configured — keep the raw link (click just won't be tracked).
  }
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

function wrap(content: string, locale: Locale = 'lt', branding?: EmailBranding | null): string {
  const brandName = branding?.name || 'Tutlio';
  const fallbackColor = branding?.brand_color || '#4f46e5';
  const logoHtml = branding?.logo_url
    ? `<img src="${branding.logo_url}" alt="${escapeHtml(brandName)}" style="max-height:64px;max-width:200px;" />`
    : branding?.name
      ? `<span style="font-size:26px;font-weight:900;color:${fallbackColor};letter-spacing:-0.5px;">${escapeHtml(branding.name)}</span>`
      : `<span style="font-size:26px;font-weight:900;color:#4f46e5;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>`;
  const poweredBy = branding?.name && !branding.hidePoweredBy
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

/**
 * Multi-subject package items, rendered as a small breakdown table. Returns an
 * empty string when there's only one item (callers fall back to the existing
 * single-line rendering).
 */
type PackageEmailItem = { subjectName?: string; totalLessons?: number; pricePerLesson?: string | number };
function packageItemsBreakdownRows(
  items: PackageEmailItem[] | undefined,
  locale: Locale,
): string {
  if (!Array.isArray(items) || items.length < 2) return '';
  const rows = items.map((it, idx) => {
    const qty = Number(it.totalLessons) || 0;
    const label = qty === 1 ? t(locale, 'em.lessonSingular') : qty < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
    const perLesson = formatMoney(it.pricePerLesson ?? 0, undefined, locale);
    const lineTotal = formatMoney(Number(it.pricePerLesson ?? 0) * qty, undefined, locale);
    const isLast = idx === items.length - 1;
    const border = isLast ? '' : ' border-bottom:1px solid #f0eeff;';
    return `<tr>
      <td style="padding:8px 0;${border} color:#1f2937; font-size:13px;">
        <strong>${esc(String(it.subjectName || ''))}</strong>
        <span style="color:#6b7280;"> · ${qty} ${label} × ${perLesson}</span>
      </td>
      <td style="padding:8px 0;${border} color:#1f2937; font-size:13px; font-weight:600; text-align:right;">${lineTotal}</td>
    </tr>`;
  }).join('');
  return `<div class="info-card"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table></div>`;
}
const footerFor = (
  locale: Locale,
  unsubscribeEmail?: string | null,
  teamSignature?: string | null,
) => {
  const email = String(unsubscribeEmail || '').trim().toLowerCase();
  const unsubLine = email
    ? `${t(locale, 'em.unsubscribeLead')} <a href="${getAppUrl()}/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9ca3af; text-decoration:underline;">${t(locale, 'em.unsubscribeHere')}</a>`
    : t(locale, 'em.unsubscribe');
  const signature = String(teamSignature || '').trim() || t(locale, 'em.teamSignature');
  return `<div class="footer"><p>${signature}</p><p style="margin:8px 0 0; font-size:11px; color:#9ca3af;">${unsubLine}</p></div>`;
};

const formatMoney = (value: string | number, currency?: string, loc: Locale = 'lt') => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  const resolvedCurrency = currency ?? (loc === 'pl' ? 'PLN' : 'EUR');
  const intlLocale = loc === 'en' ? 'en-US' : loc === 'pl' ? 'pl-PL' : loc === 'nl' ? 'nl-NL' : 'lt-LT';
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency: resolvedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

/** Locale-aware money for email HTML (PLN on pl, EUR elsewhere). */
const emailMoney = (value: string | number | null | undefined, loc: Locale = 'lt'): string => {
  if (value == null || value === '') return '—';
  return formatMoney(value, undefined, loc);
};

function bankTransferEmailButton(d: any, locale: Locale): string {
  if (!d.perlasEnabled) return '';
  const appUrl = getAppUrl();
  const payerIsParent = d.payerIsParent || d.payment_payer === 'parent';
  const sessionsUrl = payerIsParent ? `${appUrl}/parent/lessons` : `${appUrl}/student/sessions`;
  return `<p style="color:#6b7280; font-size:13px; text-align:center; margin:20px 0 8px;">${t(locale, 'em.orPayViaBank')}</p>
    <div style="text-align:center;">
      ${outlookEmailButton(sessionsUrl, t(locale, 'em.btnPayViaBank'), '#0d9488', { fontSize: '15px', padding: '14px 32px' })}
    </div>`;
}

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
    (d.price ? td(t(locale, 'em.labelPrice'), emailMoney(d.price, locale)) : '') +
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
        ${bankTransferEmailButton(d, locale)}
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
  const sessionId = d.sessionId ? encodeURIComponent(String(d.sessionId)) : '';
  const dateParam = d.date ? encodeURIComponent(String(d.date)) : '';
  const calendarUrl = d.isTutor
    ? `${getAppUrl()}/calendar?${dateParam ? `date=${dateParam}&` : ''}sessionId=${sessionId}`
    : `${getAppUrl()}/student/schedule?sessionId=${sessionId}`;
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
        ${!d.isTutor ? td(t(locale, 'em.labelPriceAlt'), d.price ? emailMoney(d.price, locale) : '–', !d.meetingLink && !d.tutorComment) : ''}
        ${d.meetingLink ? `<tr><td style="padding:10px 0;${!d.tutorComment ? ' border-bottom:1px solid #f0eeff;' : ''} color:#6b7280; font-size:14px;">${t(locale, 'em.labelLink')}</td><td style="padding:10px 0;${!d.tutorComment ? ' border-bottom:1px solid #f0eeff;' : ''} text-align:right;"><a href="${d.meetingLink}" style="color:#6366f1; font-weight:600; font-size:14px; text-decoration:none;">${t(locale, 'em.btnJoinNow')}</a></td></tr>` : ''}
        ${d.tutorComment ? `<tr><td colspan="2" style="padding:16px 0 0 0;"><div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:16px;"><p style="color:#1e3a8a; font-size:13px; font-weight:700; margin:0 0 6px 0;">${t(locale, 'em.tutorComment')}</p><div style="color:#1e40af; font-size:14px; line-height:1.5; white-space:pre-wrap;">${d.tutorComment}</div></div></td></tr>` : ''}
        </table></div>
        <div style="text-align:center; margin-top:20px;">
          ${outlookEmailButton(sessionId ? calendarUrl : (d.isTutor ? `${getAppUrl()}/dashboard` : `${getAppUrl()}/student/sessions`), t(locale, 'em.btnOpenLesson'), '#ea580c', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function sessionReminderPayer(d: any, locale: Locale) {
  const sessionId = d.sessionId ? encodeURIComponent(String(d.sessionId)) : '';
  const studentId = d.studentId ? encodeURIComponent(String(d.studentId)) : '';
  const calendarUrl = studentId
    ? `${getAppUrl()}/parent/calendar?studentId=${studentId}&sessionId=${sessionId}`
    : `${getAppUrl()}/parent/calendar?sessionId=${sessionId}`;
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
        ${td(t(locale, 'em.labelPriceAlt'), d.price ? emailMoney(d.price, locale) : '–', !d.meetingLink)}
        ${d.meetingLink ? td(t(locale, 'em.labelLink'), `<a href="${d.meetingLink}" style="color:#6366f1; font-weight:600; text-decoration:none;">${t(locale, 'em.btnJoin')}</a>`, false) : ''}
        </table></div>
        <div class="info-card" style="background:#f8fafc; border-color:#e2e8f0;">
          <p style="color:#374151; font-size:14px; font-weight:700; margin:0 0 8px;">${t(locale, 'em.tutorContacts')}</p>
          <p style="color:#4b5563; font-size:14px; margin:0 0 6px;">📧 <a href="mailto:${d.tutorEmail || ''}" style="color:#6366f1; text-decoration:none;">${d.tutorEmail || t(locale, 'em.notSpecified')}</a></p>
          ${d.tutorPhone ? `<p style="color:#4b5563; font-size:14px; margin:0;">📱 <a href="tel:${d.tutorPhone}" style="color:#6366f1; text-decoration:none;">${d.tutorPhone}</a></p>` : ''}
        </div>
        ${sessionId ? `<div style="text-align:center; margin-top:20px;">${outlookEmailButton(calendarUrl, t(locale, 'em.btnOpenLesson'), '#ea580c', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}</div>` : ''}
      </div>${footerFor(locale, d.unsubscribeEmail)}`, locale),
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
    ? t(locale, 'em.schoolInviteSub')
    : t(locale, 'em.studentInviteSub');
  const inviteHeader = isSchoolInvite
    ? t(locale, 'em.schoolInviteHeader')
    : t(locale, 'em.studentInviteHeader');
  const inviteHeaderSub = isSchoolInvite
    ? t(locale, 'em.schoolInviteHeaderSub')
    : t(locale, 'em.studentInviteHeaderSub');
  const inviteBody = isSchoolInvite
    ? t(locale, 'em.schoolInviteBody', { student: esc(d.studentName || ''), school: esc(d.tutorName || 'School') })
    : t(locale, 'em.studentInviteBody', { tutor: d.tutorName });
  const inviteCodeLabel = isSchoolInvite
    ? t(locale, 'em.schoolStudentInviteCodeLabel')
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
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName || d.studentName })}</p>
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
  const isOngoingSchedule = d.ongoingSchedule === true;
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
  const intro = isOngoingSchedule
    ? t(locale, d.forPayer ? 'em.recurringOngoingIntroPayer' : 'em.recurringOngoingIntro', {
      tutor: d.tutorName,
      student: d.studentName,
    })
    : d.forPayer
      ? t(locale, payerIntroKey, { tutor: d.tutorName, count: String(count), student: d.studentName })
      : t(locale, studentIntroKey, { tutor: d.tutorName, count: String(count) });

  const subjectLine = isOngoingSchedule
    ? t(locale, 'em.recurringOngoingSub', { tutor: d.tutorName })
    : d.forPayer
      ? t(locale, 'em.recurringSubPayer', { count: String(count), tutor: d.tutorName })
      : t(locale, 'em.recurringSub', { count: String(count), tutor: d.tutorName });

  const accountLink = d.forPayer ? appUrl : `${appUrl}/student/sessions`;
  const weekday =
    typeof d.recurringWeekday === 'number' && d.recurringWeekday >= 0 && d.recurringWeekday <= 6
      ? t(locale, `em.weekday${d.recurringWeekday}`)
      : String(d.recurringWeekday || '').trim();
  const recurTime = String(d.recurringTime || '').trim();
  const showCompactSummary = weekday && recurTime && count > 0;
  const showFullTable = !isOngoingSchedule && (!showCompactSummary || count <= 20);

  const ongoingScheduleText = Array.isArray(d.schedule)
    ? d.schedule
      .map((item: any) => {
        const weekdayNumber = Number(item?.weekday);
        const time = String(item?.time || '').trim();
        if (!Number.isInteger(weekdayNumber) || weekdayNumber < 0 || weekdayNumber > 6 || !time) return '';
        const day = t(locale, `em.weekday${weekdayNumber}`).toLocaleUpperCase(locale);
        return `${day} ${time}`;
      })
      .filter(Boolean)
      .join(' · ')
    : '';

  const summaryBlock = isOngoingSchedule && ongoingScheduleText
    ? `<div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:16px; margin:16px 0;">
        <p style="margin:0; color:#312e81; font-size:15px; font-weight:600; line-height:1.5;">
          ${t(locale, 'em.recurringOngoingSummary', { schedule: esc(ongoingScheduleText) })}
        </p>
      </div>`
    : showCompactSummary
      ? `<div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:16px; margin:16px 0;">
        <p style="margin:0; color:#312e81; font-size:15px; font-weight:600; line-height:1.5;">
          ${t(locale, 'em.recurringSummary', { count: String(count), weekday, time: recurTime })}
        </p>
      </div>`
      : '';

  return {
    subject: subjectLine,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}"><h1>${t(locale, 'em.recurringHeader')}</h1><p>${t(locale, 'em.recurringHeaderSub')}</p></div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.forPayer ? (d.payerName || '') : d.studentName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">${intro}</p>
        ${summaryBlock}
        ${table(
          (d.subject ? td(t(locale, 'em.recurringSubjectLabel'), d.subject) : '') +
          (d.duration ? td(t(locale, 'em.recurringDurationLabel'), `${d.duration} ${t(locale, 'em.min')}`) : '') +
          (!isOngoingSchedule ? td(t(locale, 'em.recurringTotalLabel'), String(count), false) : '')
        )}
        ${showFullTable ? `<div style="background:#f8f7ff; border:1px solid #e5e3ff; border-radius:12px; padding:16px; margin:20px 0;">
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
        </div>` : ''}
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

  const reasonBlock = d.reason
    ? `<div class="info-card" style="background:#eff6ff; border-color:#bfdbfe; margin-top: 16px;">
        <h3 style="color:#1e3a8a; font-size:15px; margin:0 0 8px 0;">${t(locale, 'em.rescheduleReason')}</h3>
        <p style="color:#1d4ed8; font-size:14px; margin:0; line-height:1.5;">${d.reason}</p>
      </div>`
    : '';

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
        ${reasonBlock}
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
        ${table(td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time) + td(t(locale, 'em.labelPriceAlt'), emailMoney(d.price, locale), false))}
        ${d.bankAccountName ? `
        <div class="info-card" style="background:#f0fdf4; border-color:#bbf7d0; margin-top:16px;">
          <h3 style="color:#166534; font-size:14px; margin:0 0 12px 0; font-weight:700;">${t(locale, 'em.bankDetailsTitle')}</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td(t(locale, 'em.labelRecipient'), d.bankAccountName)}
            ${td(t(locale, 'em.labelAccountNo'), d.bankAccountNumber)}
            ${d.paymentPurpose ? td(t(locale, 'em.labelPurpose'), d.paymentPurpose) : ''}
            ${td(t(locale, 'em.labelAmount'), emailMoney(d.price, locale), false)}
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
        ${table(td(t(locale, 'em.labelDate'), d.date) + td(t(locale, 'em.labelTime'), d.time) + (d.price ? td(t(locale, 'em.labelAmount'), emailMoney(d.price, locale), false) : ''))}
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
      td(t(locale, 'em.labelPriceAlt'), emailMoney(d.amount, locale), false),
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
        ${bankTransferEmailButton(d, locale)}
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
      td(t(locale, 'em.labelPriceAlt'), emailMoney(d.amount, locale), false) +
      td(t(locale, 'em.labelPayBy'), d.payByTime, false)
    )}
        ${payBlock}
        ${bankTransferEmailButton(d, locale)}
      </div>${footerFor(locale, d.unsubscribeEmail)}`, locale),
  };
}

function penaltyPaymentSuccess(d: any, locale: Locale) {
  const fmt = (x: unknown) => (typeof x === 'number' ? x.toFixed(2) : String(x ?? ''));
  const charged =
    d.totalChargedEur != null && Number(d.totalChargedEur) > 0
      ? td(t(locale, 'em.labelTotalCharged'), `${emailMoney(Number(d.totalChargedEur), locale)} ${t(locale, 'em.includingFees')}`, false)
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

function tutorAdjustmentNotice(d: any, _locale: Locale) {
  const amount = Number(d.amountEur) || 0;
  const sign = amount < 0 ? '' : '+';
  return {
    subject: 'Pro Klasė: koregavimas jūsų atlyginime',
    html: wrap(`
      <div class="body">
        <p>Sveiki${d.tutorName ? `, ${d.tutorName}` : ''},</p>
        <p>Administracija pritaikė koregavimą: <strong>${sign}${amount.toFixed(2)} €</strong>.</p>
        ${d.reason ? `<p>Priežastis: ${d.reason}</p>` : ''}
        ${d.financeUrl ? `<p><a href="${d.financeUrl}">Peržiūrėti finansus</a></p>` : ''}
      </div>`, _locale),
  };
}

function penaltyPaymentTutor(d: any, locale: Locale) {
  const fmt = (x: unknown) => (typeof x === 'number' ? x.toFixed(2) : String(x ?? ''));
  const charged =
    d.totalChargedEur != null && Number(d.totalChargedEur) > 0
      ? td(t(locale, 'em.labelTotalCharged'), `${emailMoney(Number(d.totalChargedEur), locale)} ${t(locale, 'em.includingFees')}`, false)
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
    moneyRows = td(t(locale, 'em.labelTotalPaid'), emailMoney(lessonNum, locale), false);
  } else if (lessonNum != null && chargedNum != null && chargedNum > lessonNum + 0.02) {
    // Receipt breakdown: teaching service (tutor/agency) + platform fee (MB Tutlio) + total.
    const providerName = String(d.providerName || d.tutorName || '').trim();
    const platformFeeNum = Math.round((chargedNum - lessonNum) * 100) / 100;
    moneyRows =
      td(t(locale, 'em.feeRowTeaching', { provider: providerName }), emailMoney(lessonNum, locale)) +
      td(t(locale, 'em.feeRowPlatform'), emailMoney(platformFeeNum, locale)) +
      td(t(locale, 'em.labelTotalCharged'), emailMoney(chargedNum, locale), false);
  } else if (lessonNum != null && chargedNum != null && chargedNum < lessonNum - 0.02) {
    moneyRows =
      td(t(locale, 'em.labelLessonPrice'), emailMoney(lessonNum, locale)) +
      td(t(locale, 'em.labelTotalPaid'), emailMoney(chargedNum, locale), false);
  } else if (lessonNum != null) {
    moneyRows = td(t(locale, 'em.labelLessonPrice'), emailMoney(lessonNum, locale));
  } else if (chargedNum != null) {
    moneyRows = td(t(locale, 'em.labelTotalCharged'), `${emailMoney(chargedNum, locale)} ${t(locale, 'em.includingFees')}`, false);
  } else if (d.price) {
    moneyRows = td(t(locale, 'em.labelPrice'), emailMoney(d.price, locale));
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

// School-contract e-signing (GoSign). Lithuanian-only B2B feature, so the copy
// is inline LT rather than going through the 12-locale i18n dictionaries.
function schoolInstallmentScheduleHtml(
  d: any,
  locale: Locale,
  footerNote?: string,
): string {
  const installments = Array.isArray(d.installments) ? d.installments : [];
  if (installments.length === 0) return '';
  const installmentsTotal = installments.reduce((sum: number, it: any) => sum + Number(it?.amount || 0), 0);
  const note =
    footerNote ||
    'Mokėjimo nuorodas gausite el. paštu po sutarties pasirašymo — pagal aukščiau nurodytus terminus.';
  return `
        <p style="color:#111827; font-size:14px; font-weight:600; margin:20px 0 8px;">Mokėjimo grafikas</p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${installments
              .map((it: any, idx: number) =>
                td(
                  `${esc(it.number ?? idx + 1)} įmoka`,
                  `${emailMoney(Number(it.amount || 0), locale)} — iki ${esc(it.dueDate || '—')}`,
                  idx < installments.length - 1 || installments.length > 1,
                ),
              )
              .join('')}
            ${installments.length > 1 ? td('Iš viso', emailMoney(installmentsTotal, locale), false) : ''}
          </table>
        </div>
        ${Number(d.additionalFeeAmount || 0) > 0
          ? `<p style="color:#6b7280; font-size:12px; margin:8px 0 0;">Į 1 įmoką įtrauktas papildomas mokestis — ${emailMoney(Number(d.additionalFeeAmount), locale)}${d.additionalFeePurpose ? ` (${esc(d.additionalFeePurpose)})` : ''}.</p>`
          : ''}
        <p style="color:#6b7280; font-size:12px; margin:8px 0 0;">${note}</p>`;
}

function schoolContractSignRequest(d: any, locale: Locale) {
  const student = d.studentName ? ` – ${d.studentName}` : '';
  const scheduleBlock = schoolInstallmentScheduleHtml(d, locale);
  return {
    subject: `Pasirašykite ugdymo sutartį${student}`,
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#6366f1', '#4f46e5')}">
        <h2 style="color:#ffffff; font-size:24px; margin:0; font-weight:700;">Sutartis paruošta pasirašyti</h2>
      </div>
      <div class="body">
        <p class="greeting">Sveiki${d.parentName ? `, ${d.parentName}` : ''},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${d.schoolName || 'Mokykla'} pasirašė ugdymo sutartį${d.studentName ? ` dėl ${d.studentName}` : ''}.
          Kviečiame ją pasirašyti elektroniniu parašu — Mobiliuoju parašu, LT ID, asmens tapatybės kortele ar USB laikmena. Naudojate Smart-ID? Nuorodoje rasite pasirašymo per Dokobit instrukciją, o pasirašytą PDF įkelsite ten pat.
        </p>${scheduleBlock}
        <div style="text-align:center; margin-top:24px;">
          ${outlookEmailButton(d.signUrl, 'Pasirašyti sutartį', '#4f46e5', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
        ${d.pdfUrl ? `<div style="text-align:center; margin-top:12px;">${outlookEmailButton(d.pdfUrl, 'Peržiūrėti mokyklos pasirašytą PDF', '#64748b', { fontWeight: '600', fontSize: '13px', padding: '10px 22px' })}</div>` : ''}
        <p style="color:#9ca3af; font-size:12px; margin-top:16px;">
          Ši nuoroda asmeninė – neperduokite jos kitiems. Nuoroda galioja 14 dienų.
        </p>
      </div>${footerFor('lt')}`,
      'lt',
    ),
  };
}

function schoolContractFullySigned(d: any, _locale: Locale) {
  const student = d.studentName ? ` – ${d.studentName}` : '';
  return {
    subject: `Sutartis pasirašyta abiejų šalių${student}`,
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h2 style="color:#ffffff; font-size:24px; margin:0; font-weight:700;">Sutartis pasirašyta</h2>
      </div>
      <div class="body">
        <p class="greeting">Sveiki${d.parentName ? `, ${d.parentName}` : ''},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Ugdymo sutartis${d.studentName ? ` dėl ${d.studentName}` : ''} pasirašyta abiejų šalių.
          Atskiru laišku gausite apmokėjimo informaciją.
        </p>
        ${d.pdfUrl ? `<div style="text-align:center; margin-top:20px;">${outlookEmailButton(d.pdfUrl, 'Atsisiųsti pasirašytą sutartį', '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}</div>` : ''}
      </div>${footerFor('lt')}`,
      'lt',
    ),
  };
}

/** Admin alert after the parent reviewed/supplemented data; school must sign next. */
function schoolContractCompletionAdmin(d: any, _locale: Locale) {
  const contractsUrl = String(d.contractsUrl || `${getAppUrl().replace(/\/$/, '')}/school/contracts`).trim();
  return {
    subject: `Sutarties duomenys patvirtinti${d.studentName ? ` – ${d.studentName}` : ''}`,
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#f59e0b', '#d97706')}">
        <h2 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">Sutartis paruošta mokyklos parašui</h2>
      </div>
      <div class="body">
        <p style="color:#4b5563;font-size:14px;line-height:1.6;">
          Tėvai peržiūrėjo sutartį${d.studentName ? ` dėl <strong>${esc(d.studentName)}</strong>` : ''} ir patvirtino duomenis.
          Peržiūrėkite naujausią PDF Tutlio ir pasirašykite per GoSign.
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Mokinys', esc(d.studentName || '—'))}
            ${td('Sutarties Nr.', esc(d.contractNumber || '—'), false)}
          </table>
        </div>
        <div style="text-align:center;margin-top:20px;">
          ${outlookEmailButton(contractsUrl, 'Peržiūrėti ir pasirašyti Tutlio', '#d97706', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
        ${d.pdfUrl ? `<div style="text-align:center;margin-top:12px;">${outlookEmailButton(d.pdfUrl, 'Atidaryti naujausią PDF', '#64748b', { fontWeight: '600', fontSize: '13px', padding: '10px 22px' })}</div>` : ''}
      </div>${footerFor('lt')}`,
      'lt',
    ),
  };
}

/** Admin alert after the last parent signature finalized the PDF. */
function schoolContractParentSignedAdmin(d: any, _locale: Locale) {
  const contractsUrl = String(d.contractsUrl || `${getAppUrl().replace(/\/$/, '')}/school/contracts`).trim();
  return {
    subject: `Tėvai pasirašė sutartį${d.studentName ? ` – ${d.studentName}` : ''}`,
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#10b981', '#059669')}">
        <h2 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">Sutartis pasirašyta abiejų šalių</h2>
      </div>
      <div class="body">
        <p style="color:#4b5563;font-size:14px;line-height:1.6;">
          ${d.parentName ? `<strong>${esc(d.parentName)}</strong>` : 'Tėvai'} pasirašė ugdymo sutartį${d.studentName ? ` dėl <strong>${esc(d.studentName)}</strong>` : ''}.
          Naujausia abiejų šalių pasirašyta versija jau rodoma Tutlio Sutarčių skiltyje.
        </p>
        <div style="text-align:center;margin-top:20px;">
          ${outlookEmailButton(contractsUrl, 'Atidaryti Sutarčių skiltį', '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
        </div>
        ${d.pdfUrl ? `<div style="text-align:center;margin-top:12px;">${outlookEmailButton(d.pdfUrl, 'Atidaryti pasirašytą PDF', '#64748b', { fontWeight: '600', fontSize: '13px', padding: '10px 22px' })}</div>` : ''}
      </div>${footerFor('lt')}`,
      'lt',
    ),
  };
}

function lessonConfirmedTutor(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const linkRow = d.meetingLink
    ? td(t(locale, 'em.labelLink'), `<a href="${d.meetingLink}" style="color:#6366f1; font-weight:600; text-decoration:none;">${t(locale, 'em.btnJoinNow')}</a>`, false)
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
          (d.price != null ? td(t(locale, 'em.labelSum'), emailMoney(d.price, locale)) : '')
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
      td(t(locale, 'em.thPrice'), emailMoney(d.price, locale)) +
      td(t(locale, 'em.payReminderDeadline'), t(locale, 'em.payReminderTiming', { hours: String(d.deadlineHours), timing: timingLt }), false)
    )}
        <p style="color:#ef4444; font-size:14px; font-weight:600;">
          ${t(locale, 'em.payReminderUrgent')}
        </p>
        ${payBlock}
        ${bankTransferEmailButton(d, locale)}
      </div>
      ${footerFor(locale, d.unsubscribeEmail)}
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
      td(t(locale, 'em.labelAmountAlt'), emailMoney(d.price, locale)) +
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
      td(t(locale, 'em.labelAmountAlt'), emailMoney(d.price, locale), false)
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
  const pricePerLesson = formatMoney(d.pricePerLesson, undefined, locale);
  const totalPrice = formatMoney(d.totalPrice, undefined, locale);
  const items: PackageEmailItem[] = Array.isArray(d.items) ? d.items : [];
  const isMulti = items.length > 1;
  const itemsBreakdown = packageItemsBreakdownRows(items, locale);
  const proKlase = d.isProKlase === true || isProKlaseOrg(d.organizationId);
  const headerSub = proKlase
    ? t(locale, 'em.packageReqHeaderSubProKlase')
    : t(locale, 'em.packageReqHeaderSub');
  const bodyText = proKlase
    ? t(locale, 'em.packageReqBodyProKlase')
    : t(locale, 'em.packageReqBody', {
        tutor: d.tutorName,
        studentPart: d.studentName !== d.recipientName ? t(locale, 'em.packageReqStudentPart', { student: d.studentName }) : '',
      });
  const howBody = proKlase
    ? t(locale, 'em.packageHowBodyProKlase')
    : t(locale, 'em.packageHowBody', {
        count: String(d.totalLessons),
        subject: d.subjectName,
        label: d.totalLessons === 1 ? t(locale, 'em.lessonSingular') : d.totalLessons < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany'),
      });
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
        <p>${headerSub}</p>
        ${proKlase
          ? `<p style="color:rgba(255,255,255,0.92); font-size:13px; line-height:1.6; margin:12px 0 0;">
              <strong>${t(locale, 'em.packageProKlaseEmailLabel')}</strong>
              <a href="mailto:info@proklase.lt" style="color:#ffffff; text-decoration:underline;">info@proklase.lt</a>
              &nbsp;·&nbsp;
              <strong>${t(locale, 'em.packageProKlasePhoneLabel')}</strong>
              <a href="tel:+37065687287" style="color:#ffffff; text-decoration:underline;">+370 656 87287</a>
            </p>`
          : ''}
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${bodyText}
        </p>
        ${isMulti
          ? itemsBreakdown + table(
              td(t(locale, 'em.labelLessonCount'), `${d.totalLessons} ${totalLessonsLabel}`) +
              td(t(locale, 'em.labelPayable'), `<strong style="font-size:16px;">${totalPrice}</strong>`, false)
            )
          : table(
              td(t(locale, 'em.labelSubject'), d.subjectName) +
              td(t(locale, 'em.labelLessonCount'), `${d.totalLessons} ${totalLessonsLabel}`) +
              td(t(locale, 'em.labelPricePerLesson'), pricePerLesson) +
              td(t(locale, 'em.labelPayable'), `<strong style="font-size:16px;">${totalPrice}</strong>`, false)
            )}
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:20px 0;">
          <p style="color:#166534; font-size:14px; margin:0; line-height:1.6;">
            ${t(locale, 'em.packageHowTitle')}<br/>
            ${howBody}
          </p>
        </div>
        ${payBlock}
      </div>
      ${footerFor(locale, null, d.emailTeamSignature)}
    `, locale),
  };
}

function prepaidPackageSuccess(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const avail = Math.max(0, Number(d.availableLessons) || 0);
  const total = Math.max(0, Number(d.totalLessons) || 0);
  const items: PackageEmailItem[] = Array.isArray(d.items) ? d.items : [];
  const isMulti = items.length > 1;
  const itemsBreakdown = packageItemsBreakdownRows(items, locale);
  const subj = isMulti
    ? items.map((it) => String(it.subjectName || '')).filter(Boolean).join(', ')
    : (d.subjectName || '–');
  const availLabel = avail === 1 ? t(locale, 'em.lessonSingular') : avail < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  const totalLabel = total === 1 ? t(locale, 'em.lessonSingular') : total < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  // Fee breakdown when the payer was charged more than the package price.
  const pkgBaseNum = Number(d.baseTotalEur ?? d.totalPrice);
  const pkgChargedNum = d.totalChargedEur != null ? Number(d.totalChargedEur) : null;
  let moneyRows: string;
  if (
    pkgChargedNum != null && Number.isFinite(pkgBaseNum) && Number.isFinite(pkgChargedNum) &&
    pkgChargedNum > pkgBaseNum + 0.02
  ) {
    const providerName = String(d.providerName || d.tutorName || '').trim();
    const feeNum = Math.round((pkgChargedNum - pkgBaseNum) * 100) / 100;
    moneyRows =
      td(t(locale, 'em.feeRowTeaching', { provider: providerName }), emailMoney(pkgBaseNum, locale)) +
      td(t(locale, 'em.feeRowPlatform'), emailMoney(feeNum, locale)) +
      td(t(locale, 'em.labelTotalCharged'), emailMoney(pkgChargedNum, locale), false);
  } else {
    moneyRows = td(t(locale, 'em.labelTotalPaid'), emailMoney(d.totalPrice, locale), false);
  }
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
        ${isMulti
          ? itemsBreakdown + table(
              td(t(locale, 'em.labelAvailable'), `${avail}/${total}`) +
              moneyRows
            )
          : table(
              td(t(locale, 'em.labelSubject'), subj) +
              td(t(locale, 'em.labelAvailable'), `${avail}/${total}`) +
              moneyRows
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
  const items: PackageEmailItem[] = Array.isArray(d.items) ? d.items : [];
  const isMulti = items.length > 1;
  const itemsBreakdown = packageItemsBreakdownRows(items, locale);
  // Combined subject label for the body sentence ("Math, Physics" etc.)
  const subjectLabel = isMulti
    ? items.map((it) => String(it.subjectName || '')).filter(Boolean).join(', ')
    : (d.subjectName as string | undefined) || '';
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
          ${t(locale, 'em.packageDepletedBody', { student: d.studentName, subject: subjectLabel })}
        </p>
        ${isMulti
          ? itemsBreakdown + table(
              td(t(locale, 'em.labelStudentAlt'), d.studentName) +
              td(t(locale, 'em.labelPackageSize'), `${d.totalLessons || 0} ${t(locale, 'em.lessonsOf')}`, false)
            )
          : table(
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
          <td style="padding:12px 8px; color:#1f2937; font-size:14px; font-weight:600; text-align:right;">${emailMoney(s.price, locale)}</td>
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
              ${d.platformFees ? `
              <tr style="background:#f0f9ff;">
                <td colspan="3" style="padding:10px 8px; color:#374151; font-size:14px; text-align:right;">${t(locale, 'em.lessonsSubtotal')}</td>
                <td style="padding:10px 8px; color:#374151; font-size:14px; font-weight:600; text-align:right;">${emailMoney(d.lessonsTotal, locale)}</td>
              </tr>
              <tr style="background:#f0f9ff;">
                <td colspan="3" style="padding:10px 8px; color:#6b7280; font-size:13px; text-align:right;">${t(locale, 'em.platformFees')}</td>
                <td style="padding:10px 8px; color:#6b7280; font-size:13px; font-weight:600; text-align:right;">${emailMoney(d.platformFees, locale)}</td>
              </tr>
              ` : ''}
              <tr style="background:#f0f9ff; border-top:2px solid #bfdbfe;">
                <td colspan="3" style="padding:14px 8px; color:#1e40af; font-size:15px; font-weight:700; text-align:right;">${t(locale, 'em.totalLabel')}</td>
                <td style="padding:14px 8px; color:#1e40af; font-size:16px; font-weight:800; text-align:right;">${emailMoney(d.totalAmount, locale)}</td>
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
  const pricePerLesson = formatMoney(d.pricePerLesson, undefined, locale);
  const totalPrice = formatMoney(d.totalPrice, undefined, locale);
  const paymentUrl = typeof d.paymentUrl === 'string' && d.paymentUrl.trim().length > 0 ? String(d.paymentUrl).trim() : '';
  const items: PackageEmailItem[] = Array.isArray(d.items) ? d.items : [];
  const isMulti = items.length > 1;
  const itemsBreakdown = packageItemsBreakdownRows(items, locale);
  const proKlase = d.isProKlase === true || isProKlaseOrg(d.organizationId);
  const headerSub = proKlase
    ? t(locale, 'em.packageReqHeaderSubProKlase')
    : t(locale, 'em.manualPkgHeaderSub');
  const bodyText = proKlase
    ? t(locale, 'em.packageReqBodyProKlase')
    : t(locale, 'em.manualPkgBody', { student: d.studentName, org: d.orgName });
  const howBlock = proKlase
    ? `${t(locale, 'em.packageHowTitle')}<br/>${t(locale, 'em.packageHowBodyProKlase')}`
    : `${t(locale, 'em.manualPkgHowTitle')}<br/>
            ${t(locale, 'em.manualPkgHowBody', { price: totalPrice, org: d.orgName })}
            ${paymentUrl
              ? ` ${t(locale, 'em.manualPkgUseLink')}`
              : ` ${t(locale, 'em.manualPkgContactOrg')}`}
            ${t(locale, 'em.manualPkgActivation')}`;
  return {
    subject: t(locale, 'em.manualPkgSub', { count: String(d.totalLessons), label: totalLessonsLabel, subject: d.subjectName }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#8b5cf6', '#6366f1')}">
        <h1>${t(locale, 'em.manualPkgHeader')}</h1>
        <p>${headerSub}</p>
        ${proKlase
          ? `<p style="color:rgba(255,255,255,0.92); font-size:13px; line-height:1.6; margin:12px 0 0;">
              <strong>${t(locale, 'em.packageProKlaseEmailLabel')}</strong>
              <a href="mailto:info@proklase.lt" style="color:#ffffff; text-decoration:underline;">info@proklase.lt</a>
              &nbsp;·&nbsp;
              <strong>${t(locale, 'em.packageProKlasePhoneLabel')}</strong>
              <a href="tel:+37065687287" style="color:#ffffff; text-decoration:underline;">+370 656 87287</a>
            </p>`
          : ''}
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.recipientName })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${bodyText}
        </p>
        ${isMulti
          ? itemsBreakdown + table(
              td(t(locale, 'em.labelLessonCount'), `${d.totalLessons} ${totalLessonsLabel}`) +
              td(t(locale, 'em.labelPayable'), `<strong style="font-size:16px;">${totalPrice}</strong>`, false)
            )
          : table(
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
            ${howBlock}
          </p>
        </div>
        ${paymentUrl
          ? `<div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(paymentUrl, t(locale, 'em.btnGoToPayment'), '#7c3aed', { fontSize: '16px', padding: '16px 42px' })}
        </div>`
          : ''}
      </div>
      ${footerFor(locale, null, d.emailTeamSignature)}
    `, locale),
  };
}

function manualPackageConfirmed(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const availableLessons = Math.max(0, Number(d.availableLessons) || 0);
  const totalLessons = Math.max(0, Number(d.totalLessons) || 0);
  const lessonsLabel = availableLessons === 1 ? t(locale, 'em.lessonSingular') : availableLessons < 10 ? t(locale, 'em.lessonFew') : t(locale, 'em.lessonMany');
  const items: PackageEmailItem[] = Array.isArray(d.items) ? d.items : [];
  const isMulti = items.length > 1;
  const itemsBreakdown = packageItemsBreakdownRows(items, locale);
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
        ${isMulti
          ? itemsBreakdown + table(
              td(t(locale, 'em.labelRemaining'), `${availableLessons}/${totalLessons}`) +
              td(t(locale, 'em.labelTotalPaid'), emailMoney(d.totalPrice, locale), false)
            )
          : table(
              td(t(locale, 'em.labelSubject'), d.subjectName || '–') +
              td(t(locale, 'em.labelRemaining'), `${availableLessons}/${totalLessons}`) +
              td(t(locale, 'em.labelTotalPaid'), emailMoney(d.totalPrice, locale), false)
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
  // Fee breakdown when the payer was charged more than the lessons total.
  const batchBaseNum = Number(d.baseTotalEur ?? d.totalAmount);
  const batchChargedNum = d.totalChargedEur != null ? Number(d.totalChargedEur) : null;
  let moneyRows: string;
  if (
    batchChargedNum != null && Number.isFinite(batchBaseNum) && Number.isFinite(batchChargedNum) &&
    batchChargedNum > batchBaseNum + 0.02
  ) {
    const providerName = String(d.providerName || d.tutorName || '').trim();
    const feeNum = Math.round((batchChargedNum - batchBaseNum) * 100) / 100;
    moneyRows =
      td(t(locale, 'em.feeRowTeaching', { provider: providerName }), emailMoney(batchBaseNum, locale)) +
      td(t(locale, 'em.feeRowPlatform'), emailMoney(feeNum, locale)) +
      td(t(locale, 'em.labelTotalCharged'), emailMoney(batchChargedNum, locale), false);
  } else {
    moneyRows = td(t(locale, 'em.labelSum'), emailMoney(d.totalAmount, locale), false);
  }
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
          moneyRows
        )}
        <div style="text-align:center; margin-top: 24px;">
          ${outlookEmailButton(`${appUrl}/student/sessions`, t(locale, 'em.btnViewLessonsArrow'), '#4f46e5', { fontSize: '15px', padding: '14px 32px' })}
        </div>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

function platformInvoice(d: any, locale: Locale) {
  const fmt = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) ? n.toFixed(2) : String(x ?? '');
  };
  const deductedRow =
    d.deductedAmount != null && Number(d.deductedAmount) > 0
      ? td(t(locale, 'em.platformInvoiceDeducted'), `-${emailMoney(d.deductedAmount, locale)}`)
      : '';
  return {
    subject: t(locale, 'em.platformInvoiceSub', { number: d.invoiceNumber, period: d.periodLabel }),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#4f46e5', '#6366f1')}">
        <h1>${t(locale, 'em.platformInvoiceHeader')}</h1>
        <p>${t(locale, 'em.platformInvoiceHeaderSub')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiName', { name: d.organizationName || '' })}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${t(locale, 'em.platformInvoiceBody', { period: d.periodLabel })}
        </p>
        ${table(
          td(t(locale, 'em.platformInvoiceNumberLabel'), d.invoiceNumber) +
          td(t(locale, 'em.labelPeriod'), d.periodLabel) +
          td(t(locale, 'em.labelSum'), emailMoney(d.totalAmount, locale)) +
          deductedRow +
          td(t(locale, 'em.platformInvoiceDue'), emailMoney(d.amountDue, locale), false)
        )}
        <p style="color:#6b7280; font-size:13px; line-height:1.5; margin-top:16px;">
          ${t(locale, 'em.platformInvoiceFooter')}
        </p>
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
  const missingFields: string[] = Array.isArray(d.missingFields)
    ? d.missingFields.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const reviewRequired = d.requiresReview === true || missingFields.length > 0 || Boolean(d.completionUrl);
  const completionLink = reviewRequired ? String(d.completionUrl || '').trim() : '';
  const installments = Array.isArray(d.installments) ? d.installments : [];
  const scheduleBlock =
    installments.length > 1
      ? schoolInstallmentScheduleHtml(
          d,
          locale,
          'Metinis mokestis mokamas dalimis pagal grafiką. Mokėjimo nuorodą gausite el. paštu po sutarties pasirašymo.',
        )
      : '';
  const missingFieldsHtml = missingFields.length
    ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:14px; margin:16px 0;">
        <p style="color:#9a3412; font-size:13px; font-weight:700; margin:0 0 8px;">Prašome papildyti trūkstamus duomenis:</p>
        <ul style="margin:0; padding-left:18px; color:#7c2d12; font-size:13px; line-height:1.5;">
          ${missingFields.map((item) => `<li>${esc(item)}</li>`).join('')}
        </ul>
        <p style="margin:10px 0 0; color:#7c2d12; font-size:13px; line-height:1.55; font-weight:700;">
          Svarbu: sutartį pasirašyti galėsite tik po to, kai užpildysite trūkstamus duomenis.
          Po užpildymo mokykla peržiūrės naujausią sutarties PDF ir pasirašys ją pirmoji.
        </p>
      </div>`
    : '';
  // Final signable contract → tell the parent how to sign and where to return it.
  // Only when the PDF is attached and nothing is still missing (they cannot sign a draft).
  const schoolEmailEsc = esc(d.schoolEmail || '');
  const signingInstructionsHtml = d.pdfUrl && missingFields.length === 0 && d.esignFlow !== true
    ? `<div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:14px; margin:16px 0;">
        <p style="color:#065f46; font-size:13px; font-weight:700; margin:0 0 8px;">Svarbu: tai galutinė sutarties PDF versija. Pasirašytą sutartį prašome atsiųsti mokyklai el. paštu ${schoolEmailEsc}.</p>
        <p style="color:#065f46; font-size:13px; font-weight:700; margin:10px 0 4px;">Kaip pasirašyti?</p>
        <p style="color:#047857; font-size:13px; line-height:1.55; margin:0;">PDF dokumentą galite pasirašyti elektroniniu parašu (Smart-ID, Mobilusis parašas ar kt.) arba atsispausdinti, pasirašyti ranka, nuskenuoti / nufotografuoti ir atsiųsti mokyklai el. paštu ${schoolEmailEsc}.</p>
      </div>`
    : '';
  return {
    subject: `Ugdymo šeimoje sutartis${d.contractNumber ? ` Nr. ${d.contractNumber}` : ''} — ${d.studentName || 'Mokinys'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Ugdymo šeimoje sutartis</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(d.recipientName || d.parentName || d.studentName)},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Prašome peržiūrėti Ugdymo šeimoje sutartį mokiniui <strong>${esc(d.studentName)}</strong>.
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Sutarties Nr.', esc(d.contractNumber || '—'))}
            ${td('Mokinys', esc(d.studentName))}
            ${td('Metinis mokestis', d.annualFee ? emailMoney(d.annualFee, locale) : '—')}
            ${td('Tėvų telefonas', esc(d.parentPhone || '—'))}
            ${td('Vaiko gimimo data', esc(d.childBirthDate || '—'))}
            ${td('Adresas', esc(d.address || '—'))}
            ${td('Data', d.date || new Date().toLocaleDateString('lt-LT'), false)}
          </table>
        </div>
        ${scheduleBlock}
        ${d.contractBody ? '' : ''}
        ${missingFieldsHtml}
        ${d.pdfUrl ? `<div style="margin:16px 0 10px;">${outlookEmailButton(d.pdfUrl, 'Atidaryti PDF sutartį', '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 24px' })}</div>` : ''}
        ${signingInstructionsHtml}
        ${reviewRequired && missingFields.length === 0 ? `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px;margin:16px 0;color:#3730a3;font-size:13px;line-height:1.55;">Net jei duomenų netrūksta, prieš mokyklai pasirašant prašome patvirtinti, kad sutartį peržiūrėjote ir duomenys yra teisingi.</div>` : ''}
        ${reviewRequired && completionLink ? `<div style="margin:0 0 20px;">${outlookEmailButton(completionLink, missingFields.length > 0 ? 'Papildyti duomenis ir peržiūrėti sutartį' : 'Peržiūrėti ir patvirtinti sutartį', '#2563eb', { fontWeight: '600', fontSize: '14px', padding: '12px 24px' })}</div>` : ''}
        <p style="color:#6b7280; font-size:13px;">Jei turite klausimų, susisiekite su mokykla: ${esc(schoolParentContactEmail(d))}.</p>
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolContractExtraOffer(d: any, locale: Locale) {
  const acceptUrl = String(d.acceptUrl || '').trim();
  return {
    subject: `Papildomų pamokų sutartis${d.contractNumber ? ` Nr. ${d.contractNumber}` : ''} — ${d.studentName || 'Mokinys'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Papildomų pamokų sutartis</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(d.parentName || d.studentName || '')},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Peržiūrėkite nuotolinių papildomų pamokų sutartį mokiniui <strong>${esc(d.studentName)}</strong> ir pateikite užsakymą su prievole sumokėti.
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Sutarties Nr.', esc(d.contractNumber || '—'))}
            ${td('Paslauga', esc(d.serviceName || '—'))}
            ${td('Grafikas', esc(d.schedule || '—'))}
            ${td('Pamokos kaina', d.unitPrice ? `${esc(d.unitPrice)} €` : '—')}
            ${td('Orientacinė mėnesio kaina', d.monthlyPrice ? `${esc(d.monthlyPrice)} €` : '—')}
          </table>
        </div>
        ${acceptUrl ? `<div style="margin:16px 0 10px;">${outlookEmailButton(acceptUrl, 'Peržiūrėti sutartį ir užsakyti', '#059669', { fontWeight: '600', fontSize: '14px', padding: '12px 24px' })}</div>` : ''}
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolContractExtraAccepted(d: any, locale: Locale) {
  return {
    subject: `Sutartis sudaryta${d.contractNumber ? ` Nr. ${d.contractNumber}` : ''} — ${d.studentName || 'Mokinys'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Sutartis sudaryta</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(d.parentName || d.studentName || '')},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Užregistravome jūsų užsakymą su prievole sumokėti. Žemiau — sudarymo įrašas. Išsaugota būtent ta redakcija, kurią matėte prieš pateikdami užsakymą.
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Sutarties Nr.', esc(d.contractNumber || '—'))}
            ${td('Sudarymo data', esc(d.acceptedAt || '—'))}
            ${td('Dokumento SHA-256', esc(d.sha256 || '—'))}
          </table>
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolContractExtraWithdrawn(d: any, locale: Locale) {
  return {
    subject: `Sutarties atsisakymas${d.contractNumber ? ` Nr. ${d.contractNumber}` : ''} — ${d.studentName || 'Mokinys'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#b45309', '#92400e')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Sutarties atsisakymas</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(d.parentName || d.studentName || '')},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Gavome jūsų atsisakymą nuo papildomų pamokų sutarties per 14 dienų terminą. Pareiškimo kopija pridėta.
          Mokytojo atskirai informuoti nereikia.
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Sutarties Nr.', esc(d.contractNumber || '—'))}
            ${td('Registravimo data', esc(d.at || '—'))}
          </table>
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolContractExtraTerminated(d: any, locale: Locale) {
  return {
    subject: `Sutarties nutraukimas${d.contractNumber ? ` Nr. ${d.contractNumber}` : ''} — ${d.studentName || 'Mokinys'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#4b5563', '#374151')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Sutarties nutraukimas</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki, ${esc(d.parentName || d.studentName || '')},</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Gavome prašymą nutraukti papildomų pamokų sutartį. Pareiškimo kopija pridėta.
          Mokytojo atskirai informuoti nereikia.
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Sutarties Nr.', esc(d.contractNumber || '—'))}
            ${td('Registravimo data', esc(d.at || '—'))}
          </table>
        </div>
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolContractFeeDue(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const amountEur = Number(d.amount || 50);
  const payUrl = d.installmentId
    ? `${appUrl.replace(/\/$/, '')}/api/pay-school-installment?installment=${encodeURIComponent(String(d.installmentId))}`
    : '';
  const dueDate = String(d.dueDate || '2026-07-31').trim();
  const feePurpose = String(d.feePurpose || d.additionalFeePurpose || 'Sutarties mokestis').trim();
  const hadPriorPaymentEmail = d.hadPriorPaymentEmail === true;

  const priorEmailNote = hadPriorPaymentEmail
    ? `<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:16px 0 0;">${
        locale === 'lt'
          ? 'Jei anksčiau jau gavote mokėjimo laišką su kita suma — šie <strong>50&nbsp;€</strong> bus atskaityti nuo bendros mokėtinų įmokų sumos. Atnaujintą metinio mokesčio informaciją gausite atskiru laišku.'
          : 'If you already received a payment email with a different total — this <strong>€50</strong> will be deducted from your remaining installments. You will receive an updated annual-fee payment email separately.'
      }</p>`
    : '';

  const unsignedNote =
    d.contractSigningPending === true
      ? `<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:16px 0 0;">${
          locale === 'lt'
            ? 'Jei sutartis dar nepasirašyta — sutarties mokestį galite apmokėti jau dabar; metinio mokesčio įmokas gausite atskirai po pasirašymo.'
            : 'If the contract is not fully signed yet — you may pay the contract fee now; annual fee installments will follow after signing.'
        }</p>`
      : '';

  return {
    subject: schoolContractFeeEmailSubject(d, locale),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">${
          locale === 'lt' ? 'Sutarties mokestis' : 'Contract fee'
        }</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">${locale === 'lt' ? 'Laba diena,' : 'Hello,'}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${
            locale === 'lt'
              ? `Informuojame, kad Jūsų patogumui sutarties mokestį atskyrėme nuo metinio ugdymo mokesčio (<strong>${esc(d.studentName || 'mokinys')}</strong>).`
              : `For your convenience we have separated the contract fee from the annual tuition fee for <strong>${esc(d.studentName || 'your child')}</strong>.`
          }
        </p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;margin:16px 0 0;">
          ${
            locale === 'lt'
              ? `Maloniai prašome sutarties mokestį apmokėti iki <strong>${esc(dueDate)}</strong>.`
              : `Please pay the contract fee by <strong>${esc(dueDate)}</strong>.`
          }
        </p>
        ${priorEmailNote}
        ${unsignedNote}
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td(locale === 'lt' ? 'Mokinys' : 'Student', esc(d.studentName || '—'))}
            ${td(locale === 'lt' ? 'Mokestis' : 'Fee', esc(feePurpose))}
            ${td(locale === 'lt' ? 'Mokėtina suma' : 'Amount due', emailMoney(amountEur, locale), false)}
            ${td(locale === 'lt' ? 'Terminas' : 'Due date', esc(dueDate), false)}
          </table>
        </div>
        ${payUrl ? `<div style="text-align:center; margin:24px 0;">${outlookEmailButton(payUrl, locale === 'lt' ? 'Apmokėti 50 €' : 'Pay €50', '#059669', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}</div>` : ''}
        <p style="color:#6b7280; font-size:13px;">${
          locale === 'lt'
            ? `Jei turite klausimų, susisiekite su mokykla: ${esc(schoolParentContactEmail(d))}.`
            : `Questions? Contact the school: ${esc(schoolParentContactEmail(d))}.`
        }</p>
      </div>${footerFor(locale)}`, locale),
  };
}

function schoolInstallmentRequest(d: any, locale: Locale) {
  const appUrl = getAppUrl();
  const installmentNumber = Number(d.installmentNumber || 1);
  const totalAmount = Number(d.amount || 0);
  const contractAnnualFee = Number(d.contractAnnualFee ?? d.annualFee ?? 0);
  const additionalFeeOnContract = Number(d.additionalFeeAmount || 0);
  const breakdown = schoolInstallmentPaymentBreakdown(
    { installment_number: installmentNumber, amount: totalAmount },
    {
      additional_fee_amount: additionalFeeOnContract,
      additional_fee_purpose: d.additionalFeePurpose,
    },
  );
  const payUrl = d.installmentId
    ? `${appUrl.replace(/\/$/, '')}/api/pay-school-installment?installment=${encodeURIComponent(String(d.installmentId))}`
    : (typeof d.paymentUrl === 'string' && d.paymentUrl.trim().length > 0 ? String(d.paymentUrl).trim() : '');

  const breakdownRows: string[] = [];
  if (breakdown.annualPortionEur > 0) {
    breakdownRows.push(
      td(
        locale === 'lt' ? 'Metinio mokesčio dalis (ši įmoka)' : 'Annual fee portion (this payment)',
        emailMoney(breakdown.annualPortionEur, locale),
      ),
    );
  }
  if (breakdown.additionalPortionEur > 0) {
    breakdownRows.push(
      td(
        locale === 'lt' ? 'Papildomas mokestis (ši įmoka)' : 'Additional fee (this payment)',
        `${emailMoney(breakdown.additionalPortionEur, locale)}${d.additionalFeePurpose ? ` (${esc(d.additionalFeePurpose)})` : breakdown.additionalPurpose ? ` (${esc(breakdown.additionalPurpose)})` : ''}`,
      ),
    );
  }
  if (breakdownRows.length === 0 && totalAmount > 0) {
    breakdownRows.push(td(locale === 'lt' ? 'Suma' : 'Amount', emailMoney(totalAmount, locale)));
  }
  breakdownRows.push(
    td(
      locale === 'lt' ? 'Mokėtina suma' : 'Amount due',
      totalAmount > 0 ? emailMoney(breakdown.totalEur, locale) : '—',
      false,
    ),
  );

  const contractContext =
    contractAnnualFee > 0 && Number(d.totalInstallments || 0) > 1
      ? `<p style="color:#6b7280;font-size:12px;line-height:1.5;margin:12px 0 0;">${
          locale === 'lt'
            ? `Visoje sutartyje metinis mokestis — ${emailMoney(contractAnnualFee, locale)} (mokate dalimis pagal grafiką).`
            : `Total annual fee in the contract — ${emailMoney(contractAnnualFee, locale)} (paid in installments).`
        }</p>`
      : '';

  const apologyNote =
    d.apologyForMissingEmail === true
      ? `<p style="color:#92400e;font-size:14px;line-height:1.6;margin:0 0 16px;padding:12px 14px;background:#fffbeb;border-radius:8px;border:1px solid #fcd34d;">${
          locale === 'lt'
            ? '<strong>Atsiprašome už nepatogumus.</strong> Dėl sistemos klaidos po sutarties mokesčio (50&nbsp;€) apmokėjimo automatiškai negavote metinio mokesčio mokėjimo laiško. Žemiau — teisinga suma ir mokėjimo nuoroda.'
            : '<strong>We apologise for the inconvenience.</strong> Due to a system error, you did not automatically receive the annual fee payment email after paying the €50 contract fee. Below is the correct amount and payment link.'
        }</p>`
      : '';

  const correctedPaymentNote =
    typeof d.correctedPaymentNote === 'string' && d.correctedPaymentNote.trim()
      ? `<p style="color:#92400e;font-size:14px;line-height:1.6;margin:0 0 16px;padding:12px 14px;background:#fffbeb;border-radius:8px;border:1px solid #fcd34d;">${d.correctedPaymentNote.trim()}</p>`
      : '';

  const installmentScheduleBlock =
    Array.isArray(d.installments) && d.installments.length > 1
      ? schoolInstallmentScheduleHtml(
          d,
          locale,
          'Šiuo metu prašome apmokėti pirmąją įmoką (žemiau). Kitos įmokos — pagal grafiką.',
        )
      : '';

  const scheduleUpdatedNote =
    d.scheduleUpdated === true
      ? `<p style="color:#1d4ed8;font-size:14px;line-height:1.6;margin:0 0 16px;padding:12px 14px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">${
          locale === 'lt'
            ? '<strong>Atnaujinta mokėjimo informacija.</strong> Sutarties mokestį (50&nbsp;€) atskyrėme — šiame laiške nurodyta tik metinio mokesčio įmoka. Jei anksčiau gavote kitą sumą, naudokite šią nuorodą.'
            : '<strong>Updated payment details.</strong> The €50 contract fee is now separate — this email is for the annual fee installment only. Use this link if you received an older amount.'
        }</p>`
      : '';

  return {
    subject: schoolInstallmentEmailSubject(d, locale),
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#059669', '#047857')}">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Mokėjimo prašymas</h1>
        <p style="color:rgba(255,255,255,0.85); font-size:14px; margin:8px 0 0;">${esc(d.schoolName || 'Mokykla')}</p>
      </div>
      <div class="body">
        <p class="greeting">${locale === 'lt' ? 'Sveiki,' : 'Hello,'}</p>
        ${apologyNote}
        ${correctedPaymentNote}
        ${scheduleUpdatedNote}
        ${installmentScheduleBlock}
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          ${totalAmount > 0
            ? `Atėjo laikas apmokėti <strong>${esc(d.studentName)}</strong> metinio mokesčio įmoką (${esc(d.schoolName)}).`
            : `Prašome patvirtinti <strong>${esc(d.studentName)}</strong> registraciją (${esc(d.schoolName)}), kad galėtumėte gauti prisijungimo informaciją.`}
        </p>
        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${td('Mokinys', esc(d.studentName))}
            ${td('Įmoka', `#${d.installmentNumber || '—'} iš ${d.totalInstallments || '—'}`)}
            ${breakdownRows.join('')}
            ${td('Terminas', d.dueDate || '—', false)}
          </table>
          ${contractContext}
        </div>
        ${payUrl ? `<div style="text-align:center; margin:24px 0;">${outlookEmailButton(payUrl, totalAmount > 0 ? 'Apmokėti dabar' : 'Patvirtinti registraciją', '#059669', { fontWeight: '600', fontSize: '16px', padding: '14px 36px' })}</div>` : ''}
        <p style="color:#6b7280; font-size:13px;">Jei turite klausimų, susisiekite su mokykla: ${esc(schoolParentContactEmail(d))}.</p>
      </div>${footerFor(locale, d.unsubscribeEmail)}`, locale),
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

function productUpdateWhiteboardTutor(d: any, _locale: Locale) {
  const appUrl = getAppUrl();
  const locale: Locale = 'lt';

  return {
    subject: 'Tutlio naujienos: interaktyvi lenta jūsų pamokoms',
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>Naujiena Tutlio: interaktyvi lenta</h1>
        <p>${esc(d?.subtitle || 'Naujos galimybės jūsų pamokoms')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:0 0 14px;">Pridėjome keletą naujienų, kurios turėtų padaryti jūsų pamokas dar patogesnes ir įdomesnes. Atnaujinimai įsigalios šiandien vėlai vakare, todėl rytoj viskas jau bus paruošta.</p>
        <div class="info-card">
          <p style="color:#1f2937; font-size:15px; font-weight:700; margin:0 0 10px;">🖊️ Interaktyvi lenta</p>
          <ul style="margin:0; padding-left:18px; color:#1f2937; font-size:14px; line-height:1.65;">
            <li style="margin:6px 0;">Rašykite, pieškite ir braižykite kartu su mokiniu realiu laiku — abu matote viską tuo pačiu metu</li>
            <li style="margin:6px 0;">Įkelkite paveikslėlius, schemas ar nuotraukas tiesiai į lentą</li>
            <li style="margin:6px 0;">Eksportuokite viską, kas nupiešta, į PDF failą — puikiai tinka, jei norite palikti mokiniui pamokos santrauką</li>
            <li style="margin:6px 0;">Tinklelis padeda viską laikyti tvarkingai ir aiškiai</li>
          </ul>
        </div>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:14px 0 0;">Taip pat pataisėme keletą smulkių dalykų, kad platforma veiktų sklandžiau ir patikimiau.</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:14px 0 0;">Jei turite klausimų ar pastabų — visada laukiame jūsų laiškų adresu <a href="mailto:info@tutlio.lt" style="color:#4f46e5; font-weight:700; text-decoration:none;">info@tutlio.lt</a>.</p>
        <div style="text-align:center; margin-top: 22px;">
          ${outlookEmailButton(`${appUrl}/dashboard`, 'Atidaryti Tutlio', '#4f46e5', { fontWeight: '700', fontSize: '15px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`,
      locale,
    ),
  };
}

function productUpdateWhiteboardStudent(d: any, _locale: Locale) {
  const appUrl = getAppUrl();
  const locale: Locale = 'lt';

  return {
    subject: 'Tutlio naujienos: interaktyvi lenta ir failų atsisiuntimas',
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>Naujiena Tutlio: lenta + failų atsisiuntimas</h1>
        <p>${esc(d?.subtitle || 'Naujos galimybės tau')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:0 0 14px;">Turime keletą naujienų, kurios turėtų padaryti mokymąsi dar patogesnį. Atnaujinimai įsigalios šiandien vėlai vakare, todėl rytoj viskas jau bus paruošta.</p>
        <div class="info-card">
          <p style="color:#1f2937; font-size:15px; font-weight:700; margin:0 0 10px;">🖊️ Interaktyvi lenta</p>
          <ul style="margin:0; padding-left:18px; color:#1f2937; font-size:14px; line-height:1.65;">
            <li style="margin:6px 0;">Pieškite, rašykite ir braižykite kartu su savo mokytoju realiu laiku — lyg sėdėtumėte prie vieno stalo</li>
            <li style="margin:6px 0;">Mokytojas gali įkelti paveikslėlių ar schemų, kurias iškart matysite</li>
          </ul>
        </div>
        <div class="info-card">
          <p style="color:#1f2937; font-size:15px; font-weight:700; margin:0 0 10px;">📥 Failų atsisiuntimas</p>
          <ul style="margin:0; padding-left:18px; color:#1f2937; font-size:14px; line-height:1.65;">
            <li style="margin:6px 0;">Pokalbio metu dalinami failai dabar lengvai atsisiunčiami — tiesiog paspauskite ant failo ir jis atsisiųs į jūsų įrenginį</li>
          </ul>
        </div>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:14px 0 0;">Taip pat pataisėme keletą smulkių dalykų, kad viskas veiktų greičiau ir patogiau.</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:14px 0 0;">Jei kyla klausimų — drąsiai kreipkitės adresu <a href="mailto:info@tutlio.lt" style="color:#4f46e5; font-weight:700; text-decoration:none;">info@tutlio.lt</a>.</p>
        <div style="text-align:center; margin-top: 22px;">
          ${outlookEmailButton(`${appUrl}/student/dashboard`, 'Atidaryti Tutlio', '#4f46e5', { fontWeight: '700', fontSize: '15px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`,
      locale,
    ),
  };
}

function productUpdateWhiteboardParent(d: any, _locale: Locale) {
  const appUrl = getAppUrl();
  const locale: Locale = 'lt';

  return {
    subject: 'Tutlio naujienos: pamokų informacija ir pranešimų valdymas',
    html: wrap(
      `
      <div class="header" style="${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>Tutlio naujienos tėvams</h1>
        <p>${esc(d?.subtitle || 'Patobulinimai jūsų patogumui')}</p>
      </div>
      <div class="body">
        <p class="greeting">${t(locale, 'em.hiPlain')}</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:0 0 14px;">Padarėme keletą atnaujinimų galvodami apie jus — kad galėtumėte patogiau sekti savo vaiko mokymosi eigą. Atnaujinimai įsigalios šiandien vėlai vakare, todėl rytoj viskas jau bus paruošta.</p>
        <div class="info-card">
          <p style="color:#1f2937; font-size:15px; font-weight:700; margin:0 0 10px;">📋 Papildoma pamokos informacija</p>
          <ul style="margin:0; padding-left:18px; color:#1f2937; font-size:14px; line-height:1.65;">
            <li style="margin:6px 0;">Pamokų istorijoje dabar galite matyti daugiau informacijos apie kiekvieną pamoką — mokytojo komentarus, pamokos temą ir kitą naudingą informaciją</li>
            <li style="margin:6px 0;">Tai padės geriau sekti, kaip vyksta jūsų vaiko mokymasis</li>
          </ul>
        </div>
        <div class="info-card">
          <p style="color:#1f2937; font-size:15px; font-weight:700; margin:0 0 10px;">🔔 Pranešimų valdymas</p>
          <ul style="margin:0; padding-left:18px; color:#1f2937; font-size:14px; line-height:1.65;">
            <li style="margin:6px 0;">Jei priminimų apie pamokas gaunate per daug arba jie jums nereikalingi — dabar galite juos lengvai išjungti</li>
            <li style="margin:6px 0;">Tiesiog eikite į Nustatymus ir ten rasite perjungiklį pamokų priminimams. Galėsite bet kada vėl juos įjungti</li>
          </ul>
        </div>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:14px 0 0;">Taip pat atlikome keletą patobulinimų ir pataisymų, kad platforma veiktų dar patikimiau ir paprasčiau.</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6; margin:14px 0 0;">Jei turite klausimų — mielai padėsime! Rašykite adresu <a href="mailto:info@tutlio.lt" style="color:#4f46e5; font-weight:700; text-decoration:none;">info@tutlio.lt</a>.</p>
        <div style="text-align:center; margin-top: 22px;">
          ${outlookEmailButton(`${appUrl}/parent/dashboard`, 'Atidaryti Tutlio', '#4f46e5', { fontWeight: '700', fontSize: '15px', padding: '14px 36px' })}
        </div>
      </div>${footerFor(locale)}`,
      locale,
    ),
  };
}

/** Vidinis HTML (be išorinio wrap) – bodyHtml neescapinamas (tik serverio generuotas turinys). */
function blogDraftReady(d: any, locale: Locale) {
  const title = esc(d.title || '');
  const excerpt = esc(d.excerpt || '');
  const keyword = esc(d.keyword || '');
  const publishUrl = typeof d.publishUrl === 'string' ? d.publishUrl : '';
  const previewUrl = typeof d.previewUrl === 'string' ? d.previewUrl : '';
  const adminUrl = typeof d.adminUrl === 'string' ? d.adminUrl : `${getAppUrl()}/admin`;
  const coverImage = typeof d.coverImage === 'string' ? d.coverImage.trim() : '';
  const contentLt = typeof d.contentLt === 'string' ? d.contentLt : '';
  const contentEn = typeof d.contentEn === 'string' ? d.contentEn : '';
  const contentPl = typeof d.contentPl === 'string' ? d.contentPl : '';
  const titleEn = esc(d.titleEn || '');
  const titlePl = esc(d.titlePl || '');

  const previewBtn = previewUrl
    ? `<a href="${previewUrl.replace(/"/g, '%22')}" style="display:inline-block; background:#4f46e5; color:#fff; font-weight:700; font-size:15px; padding:14px 28px; border-radius:12px; text-decoration:none; margin-right:8px;">
            Peržiūrėti naršyklėje
          </a>`
    : '';

  const publishBtnInner = publishUrl
    ? `<a href="${publishUrl.replace(/"/g, '%22')}" style="display:inline-block; background:#059669; color:#fff; font-weight:700; font-size:15px; padding:14px 28px; border-radius:12px; text-decoration:none;">
            Publikuoti dabar
          </a>`
    : '';

  const actionRow =
    previewBtn || publishBtnInner
      ? `<p style="text-align:center; margin:24px 0;">${previewBtn}${publishBtnInner}</p>`
      : '';

  const coverBlock = coverImage
    ? `<div style="margin:20px 0 24px; text-align:center;">
          <img src="${esc(coverImage)}" alt="${title}" width="560" style="max-width:100%; height:auto; border-radius:12px; border:1px solid #e5e7eb;" />
          <p style="color:#9ca3af; font-size:11px; margin-top:8px;">Cover nuotrauka (DI sugeneruota pagal temą)</p>
        </div>`
    : '';

  const localeSection = (label: string, sectionTitle: string, content: string) => {
    if (!content.trim()) return '';
    return `
        <div style="margin-top:28px; padding-top:20px; border-top:1px solid #e5e7eb;">
          <p style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#6366f1; margin:0 0 8px;">${esc(label)}</p>
          ${sectionTitle ? `<p style="font-size:18px; font-weight:700; color:#111827; margin:0 0 12px;">${sectionTitle}</p>` : ''}
          <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:16px 18px;">
            ${markdownToEmailHtml(content)}
          </div>
        </div>`;
  };

  return {
    subject: `Peržiūrai: ${d.title || 'Tutlio blogo draft'}`,
    html: wrap(`
      <div class="header" style="${headerInlineStyle('#4f46e5', '#6366f1')}">
        <h1>Automatinis blogo draft</h1>
        <p>Peržiūrėkite pilną straipsnį ir nuspręskite ar publikuoti</p>
      </div>
      <div class="body">
        <p class="greeting">Sveiki,</p>
        <p style="color:#4b5563; font-size:14px; line-height:1.6;">
          Sugeneruotas naujas SEO straipsnis (raktažodis: <strong>${keyword}</strong>).
          Žemiau – pilnas turinys visomis kalbomis ir cover nuotrauka.
        </p>
        ${coverBlock}
        <p style="font-size:16px; font-weight:700; color:#111827; margin:16px 0 8px;">${title}</p>
        <p style="color:#6b7280; font-size:14px; line-height:1.5; margin-bottom:12px;">${excerpt}</p>
        ${actionRow}
        ${localeSection('Lietuvių kalba (tutlio.lt)', title, contentLt)}
        ${localeSection('English (tutlio.com)', titleEn, contentEn)}
        ${localeSection('Polski (tutlio.pl)', titlePl, contentPl)}
        ${actionRow}
        <p style="text-align:center; margin:0 0 16px;">
          <a href="${adminUrl.replace(/"/g, '%22')}" style="color:#4f46e5; font-size:13px;">Redaguoti Admin Panel →</a>
        </p>
        <p style="color:#9ca3af; font-size:12px; line-height:1.5;">
          Paspaudus „Publikuoti dabar“ straipsnis taps viešu visuose domenose (.lt / .com / .pl).
          Jei norite pataisyti turinį, pirmiau atidarykite Admin Panel ir redaguokite draft.
        </p>
      </div>
      ${footerFor(locale)}
    `, locale),
  };
}

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

/** Server-to-server (internal key) or cron — both compared in constant time. */
function isAuthorizedRequest(req: VercelRequest): boolean {
  return isInternalRequest(req) || isCronAuthorized(req);
}

/**
 * Email types the browser legitimately triggers with a user JWT (see
 * src/lib/email.ts and the waitlist panels). Everything else — announcements,
 * digests, invoices, custom HTML, etc. — requires internal/cron authorization,
 * so a regular logged-in user cannot use the platform as a phishing relay.
 */
const USER_TRIGGERABLE_EMAIL_TYPES = new Set([
  'booking_confirmation',
  'booking_notification',
  'org_tutor_availability_notice',
  'session_cancelled',
  'session_reminder',
  'package_depleted_notification',
  'payment_rejection_reminder',
  'invite_email',
  'recurring_booking_confirmation',
  'lesson_rescheduled',
  'waitlist_added',
  'waitlist_matched_student',
  'waitlist_matched_tutor',
  'payment_review_needed',
  'stripe_payment_forwarding',
  'payment_success',
  'lesson_confirmed_tutor',
  'payment_received_tutor',
  'payment_failed',
  'session_comment_added',
  'tutor_student_assigned',
  'school_contract',
  'school_installment_request',
  'school_contract_sign_request',
  'school_contract_fully_signed',
  'school_contract_extra_offer',
]);

async function getAuthenticatedUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user?.id || null;
}

function orgPermissionForEmailType(type: string): OrgAdminPermission {
  if (type.startsWith('school_contract')) return 'contracts.edit';
  if (type === 'school_installment_request' || [
    'package_depleted_notification',
    'payment_rejection_reminder',
    'payment_review_needed',
    'stripe_payment_forwarding',
    'payment_success',
    'payment_received_tutor',
    'payment_failed',
  ].includes(type)) return 'finance.edit';
  if (type === 'invite_email' || type === 'tutor_student_assigned' || type.startsWith('waitlist_')) {
    return 'students.edit';
  }
  return 'sessions.edit';
}

async function canOrgSeatSendEmail(userId: string, type: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const sb = createClient(url, key, supabaseServiceRoleClientOptions());
  const access = await getOrgAdminAccessByUserId(sb, userId);
  if (access) {
    return hasOrgAdminPermission(access.role, access.permissions, orgPermissionForEmailType(type));
  }

  // A suspended seat must not fall through as a regular authenticated user.
  const { data: membership } = await sb
    .from('organization_admins')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return !membership;
}

/** When `organizationId` is omitted from the payload, infer org from the logged-in user (tutor / org admin / student / parent). */
async function resolveOrganizationIdFromAuthBearer(req: VercelRequest): Promise<string | null> {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) return null;
  const sb = createClient(supabaseUrl, serviceKey, supabaseServiceRoleClientOptions() as any) as any;
  const { data: authData, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !authData?.user?.id) return null;
  const userId = authData.user.id as string;

  const { data: profile } = await sb.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
  if (profile?.organization_id) return profile.organization_id as string;

  const { data: adminRow } = await sb
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (adminRow?.organization_id) return adminRow.organization_id as string;

  const { data: studentRows } = await sb
    .from('students')
    .select('organization_id, tutor_id')
    .eq('linked_user_id', userId);
  const allStudentRows = (studentRows as any[]) ?? [];
  if (allStudentRows.length > 0) {
    const withOrg = allStudentRows.find((r: any) => r.organization_id);
    if (withOrg?.organization_id) return withOrg.organization_id as string;
    for (const row of allStudentRows) {
      if (!row.tutor_id) continue;
      const { data: tutorProf } = await sb.from('profiles').select('organization_id').eq('id', row.tutor_id).maybeSingle();
      if (tutorProf?.organization_id) return tutorProf.organization_id as string;
    }
  }

  const { data: parentProfileId, error: parentErr } = await sb.rpc('get_parent_profile_id_by_user_id', {
    p_user_id: userId,
  });
  if (parentErr || parentProfileId == null) return null;
  const parentId = String(parentProfileId);
  const { data: link } = await sb
    .from('parent_students')
    .select('student_id')
    .eq('parent_id', parentId)
    .limit(1)
    .maybeSingle();
  if (!link?.student_id) return null;
  const { data: childOrg } = await sb.from('students').select('organization_id, tutor_id').eq('id', link.student_id).maybeSingle();
  if (childOrg?.organization_id) return childOrg.organization_id as string;
  if (childOrg?.tutor_id) {
    const { data: childTutorProf } = await sb.from('profiles').select('organization_id').eq('id', childOrg.tutor_id).maybeSingle();
    if (childTutorProf?.organization_id) return childTutorProf.organization_id as string;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const isPrivileged = isAuthorizedRequest(req);
    const authenticatedUserId = isPrivileged ? null : await getAuthenticatedUserId(req);
    if (!isPrivileged && !authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, to, data: rawData, locale: bodyLocale } = req.body;
    if (!type || !to) {
      return res.status(400).json({ error: 'Missing required fields: type, to' });
    }
    if (!isPrivileged && !USER_TRIGGERABLE_EMAIL_TYPES.has(String(type))) {
      return res.status(403).json({ error: 'This email type requires server authorization' });
    }
    if (!isPrivileged && authenticatedUserId && !(await canOrgSeatSendEmail(authenticatedUserId, String(type)))) {
      return res.status(403).json({ error: 'Insufficient organization permission' });
    }
    const apiKey = getResendApiKey();
    if (!apiKey) {
      console.error('[send-email]', resendNotConfiguredMessage());
      return res.status(503).json({ error: resendNotConfiguredMessage() });
    }
    const resend = new Resend(apiKey);

    if (type === 'school_contract') {
      const missingFields = Array.isArray(rawData?.missingFields)
        ? rawData.missingFields.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      const requiresReview = rawData?.requiresReview === true || missingFields.length > 0;
      const hasCompletionUrl = typeof rawData?.completionUrl === 'string' && rawData.completionUrl.trim().length > 0;
      const contractId = typeof rawData?.contractId === 'string' ? rawData.contractId : '';
      // Browser callers must mint the review URL through the org-scoped
      // completion-link endpoint. Only trusted server calls may use this fallback.
      if (isPrivileged && !hasCompletionUrl && requiresReview && contractId) {
        const generated = await createSchoolCompletionUrl(contractId, req);
        if (generated) rawData.completionUrl = generated;
      }
      // Contract PDF lives in a private bucket — embed a signed URL the parent can
      // open, or drop a link that would 404.
      const signedPdfUrl = await signSchoolContractPdfUrl((rawData as any)?.pdfUrl);
      if (rawData && typeof rawData === 'object') {
        if (signedPdfUrl) (rawData as any).pdfUrl = signedPdfUrl;
        else delete (rawData as any).pdfUrl;
      }
    }

    // Before sanitize so the tracked URL gets the same HTML escaping as raw links.
    applyTrackedMeetingLink(type, rawData);
    const data = sanitizeEmailData(rawData);
    const orgIdFromPayload =
      (typeof rawData?.organizationId === 'string' && rawData.organizationId.trim()) ||
      (typeof rawData?.organization_id === 'string' && rawData.organization_id.trim()) ||
      null;
    const orgIdForBrandingLookup = orgIdFromPayload || (await resolveOrganizationIdFromAuthBearer(req));

    if (type === 'invite_email') {
      const toEmail = Array.isArray(to) ? String(to[0] || '') : String(to || '');
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (supabaseUrl && serviceKey && toEmail) {
        const inviteSb = createClient(supabaseUrl, serviceKey, supabaseServiceRoleClientOptions() as any);
        if (await studentRegistrationAlreadyActive(inviteSb, { email: toEmail })) {
          return res.status(200).json({ success: true, skipped: true, reason: 'already_registered' });
        }
      }
    }

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
      const studentName = esc(d.studentName || '');
      const hostLabel = d.publicHost || 'tutlio.lt';
      return {
        subject: t(locale, 'em.parentInviteSub'),
        html: wrap(`
          <div class="header" style="${headerInlineStyle('#7c3aed', '#6d28d9')}">
            <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">${t(locale, 'em.parentInviteHeader')}</h1>
          </div>
          <div class="body">
            <p class="greeting">${t(locale, 'em.hiNameNoEmoji', { name: d.parentName || studentName })}</p>
            <p style="color:#4b5563; font-size:14px; line-height:1.6;">
              ${t(locale, d.isSchool ? 'em.parentInviteBodySchool' : 'em.parentInviteBody', { student: studentName, org: d.orgName || '' })}
            </p>
            <p style="color:#4b5563; font-size:14px; line-height:1.6;">
              ${t(locale, 'em.parentInviteBenefits')}
            </p>
            <div style="text-align:center; margin:24px 0;">
              <a href="${String(d.registerLink || '').replace(/"/g, '%22')}" style="display:inline-block; background:#7c3aed; color:#fff; font-weight:700; font-size:15px; padding:14px 36px; border-radius:12px; text-decoration:none;">
                ${t(locale, 'em.parentInviteBtnCreate')}
              </a>
            </div>
            ${d.code ? `
            <p style="color:#4b5563; font-size:14px; line-height:1.6; text-align:center;">
              ${t(locale, 'em.parentInviteCodeFallback', { host: hostLabel, code: esc(String(d.code)) })}
            </p>` : ''}
          </div>${footerFor(locale)}`, locale),
      };
    }

    // Recurring nag to the tutor: ended lessons awaiting an explicit status
    // (org feature tutor_lesson_status_confirmation). Server-triggered only.
    function lessonStatusConfirmationReminder(d: any, locale: Locale) {
      const lt = locale === 'lt';
      const count = Number(d.count || 0);
      const lessons: Array<{ date?: string; time?: string; student?: string }> = Array.isArray(d.lessons) ? d.lessons : [];
      const rows = lessons
        .map((l) => `<tr>
          <td style="padding:8px 0; border-bottom:1px solid #f0eeff; color:#111827; font-size:14px;">${esc(String(l.date || ''))} ${esc(String(l.time || ''))}</td>
          <td style="padding:8px 0; border-bottom:1px solid #f0eeff; color:#6b7280; font-size:14px; text-align:right;">${esc(String(l.student || ''))}</td>
        </tr>`)
        .join('');
      const more = count > lessons.length
        ? `<p style="color:#6b7280; font-size:13px; margin:8px 0 0;">${lt ? `… ir dar ${count - lessons.length} pamokų.` : `… and ${count - lessons.length} more lessons.`}</p>`
        : '';
      return {
        subject: lt ? `Pažymėkite pamokų statusus (${count})` : `Confirm your lesson statuses (${count})`,
        html: wrap(`
          <div class="header" style="${headerInlineStyle('#ef4444', '#f97316')}">
            <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">${lt ? 'Nepažymėtos pamokos' : 'Lessons awaiting status'}</h1>
          </div>
          <div class="body">
            <p class="greeting">${lt ? 'Sveiki' : 'Hello'}${d.tutorName ? ', ' + esc(String(d.tutorName)) : ''}!</p>
            <p style="color:#4b5563; font-size:14px; line-height:1.6;">
              ${lt
                ? `Turite <strong>${count}</strong> pasibaigusių pamokų, kurių statusas dar nepažymėtas. Prašome nurodyti, ar pamoka įvyko (įvyko, įvyko bet vėlavo, mokinys neatvyko, atšaukta).`
                : `You have <strong>${count}</strong> ended lessons without a confirmed status. Please mark how each lesson went (happened, happened late, student no-show, cancelled).`}
            </p>
            <div class="info-card" style="background:#fef2f2; border-color:#fecaca;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
              ${more}
            </div>
            <div style="text-align:center; margin-top:20px;">
              ${outlookEmailButton(`${getAppUrl()}/dashboard`, lt ? 'Pažymėti statusus' : 'Confirm statuses', '#dc2626', { fontWeight: '600', fontSize: '14px', padding: '12px 28px' })}
            </div>
            <p style="color:#9ca3af; font-size:12px; margin-top:16px; text-align:center;">
              ${lt ? 'Priminimai bus siunčiami kasdien, kol pažymėsite visų pamokų statusus.' : 'Reminders repeat daily until every lesson status is confirmed.'}
            </p>
          </div>${footerFor(locale)}`, locale),
      };
    }

    const locale: Locale = isValidLocale(bodyLocale) ? bodyLocale : 'lt';

    // Resolve org branding for whitelabel emails
    let orgBranding: EmailBranding | null = null;
    // School-type orgs get a neutral parent-facing subject for contract/payment emails.
    let isSchoolOrg = false;
    if (orgIdForBrandingLookup) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (supabaseUrl && serviceKey) {
          const sb = createClient(supabaseUrl, serviceKey, supabaseServiceRoleClientOptions() as any) as any;
          const { data: org } = await sb
            .from('organizations')
            .select('name, logo_url, brand_color, brand_color_secondary, features, entity_type, preferred_locale')
            .eq('id', orgIdForBrandingLookup)
            .maybeSingle();
          if (org) {
            isSchoolOrg = String((org as { entity_type?: string }).entity_type || '').trim().toLowerCase() === 'school';
            // Invite links must land on the org's canonical market domain
            // (Pro Klasė → tutlio.lt) regardless of which domain the admin used.
            // Only prod tutlio.* links are rewritten — preview/localhost links
            // stay testable.
            if (type === 'invite_email') {
              const orgOrigin = canonicalOriginForOrgLocale((org as { preferred_locale?: string | null }).preferred_locale);
              const currentUrl = String((data as any)?.bookingUrl || '');
              if (orgOrigin && currentUrl) {
                try {
                  const parsed = new URL(currentUrl);
                  const host = parsed.hostname.toLowerCase();
                  const isProdTutlio = ['tutlio.lt', 'tutlio.com', 'tutlio.pl'].some(
                    (d) => host === d || host === `www.${d}`,
                  );
                  if (isProdTutlio) {
                    (data as any).bookingUrl = `${orgOrigin}${parsed.pathname}${parsed.search}`;
                  }
                } catch {
                  /* leave the caller-provided URL untouched */
                }
              }
            }
            const features = (org.features && typeof org.features === 'object' ? org.features : {}) as Record<string, unknown>;
            // Optional per-org "questions" contact address (e.g. irminta@) shown in
            // school emails. Signed contracts still go to the org email (schoolEmail).
            const orgContactEmail = String((features.contact_email as string) || '').trim();
            const contractSigningEmail = String((features.school_contract_signing_email as string) || '').trim();
            const schoolQuestionsEmail = orgContactEmail || contractSigningEmail;
            if (schoolQuestionsEmail) (data as any).contactEmail = schoolQuestionsEmail;
            if (String(type).startsWith('school_contract') && type !== 'school_contract_fee_due') {
              (data as any).esignFlow = features.school_contract_esign === true;
              if (contractSigningEmail) {
                (data as any).schoolEmail = contractSigningEmail;
              }
            }
            // Optional parent-facing display name (e.g. Mokykla be sienų „Laisvi
            // vaikai“) shown instead of the legal org name in emails. Contract PDFs
            // ({{school_name}}) keep the legal name. esc() to match sanitizeEmailData,
            // which already escaped the caller-provided value being replaced.
            const orgPublicName = String((features.public_name as string) || '').trim();
            if (orgPublicName) {
              (data as any).schoolName = esc(orgPublicName);
              if ((data as any).context === 'school' && (data as any).tutorName) (data as any).tutorName = esc(orgPublicName);
            }
            // Whitelabel for every recipient (student / parent / tutor / admin).
            // Pro Klasė always gets full branding (logo + from + signature).
            const resolved = resolveEmailOrgBranding(orgIdForBrandingLookup, org);
            orgBranding = resolved.branding;
            if (resolved.isProKlase) (data as any).isProKlase = true;
            if (resolved.emailTeamSignature) (data as any).emailTeamSignature = resolved.emailTeamSignature;
            if (resolved.emailSenderName) (data as any).emailSenderName = resolved.emailSenderName;
          }
        }
      } catch {}
    }

    // Patch the email HTML post-generation to inject org branding into the wrap() header
    function applyBranding(result: { subject: string; html: string }): { subject: string; html: string } {
      let html = applyOrgBrandingToHtml(result.html, {
        branding: orgBranding,
        emailTeamSignature: (data as any).emailTeamSignature,
        locale,
      });
      if (orgBranding) {
        // Legacy templates sometimes use indigo text without the shared helper's full set.
        html = html.replaceAll('color:#6366f1;', `color:${orgBranding.brand_color};`);
      }
      return { subject: result.subject, html };
    }

    const reminderUnsubTypes = new Set([
      'session_reminder_payer',
      'payment_reminder',
      'payment_after_lesson_reminder',
      'school_installment_request',
    ]);
    if (reminderUnsubTypes.has(type)) {
      const toEmail = Array.isArray(to) ? to[0] : to;
      if (toEmail) (data as any).unsubscribeEmail = String(toEmail).trim().toLowerCase();
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
      case 'tutor_adjustment_notice': emailContent = tutorAdjustmentNotice(data, locale); break;
      case 'lesson_confirmed_tutor': emailContent = lessonConfirmedTutor(data, locale); break;
      case 'school_contract_sign_request': emailContent = schoolContractSignRequest(data, locale); break;
      case 'school_contract_fully_signed': emailContent = schoolContractFullySigned(data, locale); break;
      case 'school_contract_completion_admin': emailContent = schoolContractCompletionAdmin(data, locale); break;
      case 'school_contract_parent_signed_admin': emailContent = schoolContractParentSignedAdmin(data, locale); break;
      case 'payment_received_tutor': emailContent = paymentReceivedTutor(data, locale); break;
      case 'payment_failed': emailContent = paymentFailed(data, locale); break;
      case 'session_comment_added': emailContent = sessionCommentAdded(data, locale); break;
      case 'prepaid_package_request': emailContent = prepaidPackageRequest(data, locale); break;
      case 'prepaid_package_success': emailContent = prepaidPackageSuccess(data, locale); break;
      case 'package_depleted_notification': emailContent = packageDepletedNotification(data, locale); break;
      case 'monthly_invoice': emailContent = monthlyInvoice(data, locale); break;
      case 'monthly_invoice_paid': emailContent = monthlyInvoicePaid(data, locale); break;
      case 'platform_invoice': emailContent = platformInvoice(data, locale); break;
      case 'manual_package_request': emailContent = manualPackageRequest(data, locale); break;
      case 'manual_package_confirmed': emailContent = manualPackageConfirmed(data, locale); break;
      case 'org_tutor_availability_notice': emailContent = orgTutorAvailabilityNotice(data, locale); break;
      case 'chat_new_message': emailContent = chatNewMessage(data, locale); break;
      case 'chat_message_digest': emailContent = chatMessageDigest(data, locale); break;
      case 'product_update_sf_chat': emailContent = productUpdateSfAndChat(data, locale); break;
      case 'lesson_status_confirmation_reminder': emailContent = lessonStatusConfirmationReminder(data, locale); break;
      case 'product_update_whiteboard_tutor': emailContent = productUpdateWhiteboardTutor(data, locale); break;
      case 'product_update_whiteboard_student': emailContent = productUpdateWhiteboardStudent(data, locale); break;
      case 'product_update_whiteboard_parent': emailContent = productUpdateWhiteboardParent(data, locale); break;
      case 'custom_html_announcement': emailContent = customHtmlAnnouncement(data, locale); break;
      case 'school_contract': emailContent = schoolContract(data, locale); break;
      case 'school_contract_extra_offer': emailContent = schoolContractExtraOffer(data, locale); break;
      case 'school_contract_extra_accepted': emailContent = schoolContractExtraAccepted(data, locale); break;
      case 'school_contract_extra_withdrawn': emailContent = schoolContractExtraWithdrawn(data, locale); break;
      case 'school_contract_extra_terminated': emailContent = schoolContractExtraTerminated(data, locale); break;
      case 'school_contract_fee_due': emailContent = schoolContractFeeDue(data, locale); break;
      case 'school_installment_request': emailContent = schoolInstallmentRequest(data, locale); break;
      case 'tutor_student_assigned': emailContent = tutorStudentAssigned(data, locale); break;
      case 'parent_invite': emailContent = parentInvite(data, locale); break;
      case 'blog_draft_ready': emailContent = blogDraftReady(data, locale); break;
      default: return res.status(400).json({ error: `Unknown email type: ${type}` });
    }

    emailContent = applyBranding(emailContent);

    if ((req.body as { dryRun?: unknown } | undefined)?.dryRun === true) {
      if (!isInternalRequest(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.status(200).json({
        success: true,
        dryRun: true,
        subject: unescapeHtml(emailContent.subject),
        html: emailContent.html,
      });
    }

    if (isSchoolOrg && type === 'school_contract') {
      emailContent = {
        ...emailContent,
        subject: `Ugdymo šeimoje sutartis${schoolStudentSubjectSuffix(data?.studentName)}`,
      };
    }

    const emailPayload: Parameters<typeof resend.emails.send>[0] = {
      from: localizedFromEmail(locale, { senderName: (data as any).emailSenderName }),
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
