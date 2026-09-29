import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supportTicketsPageForPath, type InAppSupportStatus } from '../../src/lib/inAppSupport.js';
import { escapeSupportHtml } from './supportContact.js';
import { getFromEmail, getResendApiKey, INTERNAL_NOTIFY_EMAILS } from './resendConfig.js';

export type InAppSupportStatusRow = {
  id: string;
  reporter_name: string | null;
  reporter_email: string;
  title: string;
  page: string;
  locale: string;
  status: InAppSupportStatus;
  target_date: string | null;
  status_updated_at: string;
  status_notified_signature: string | null;
  environment?: unknown;
};

const ALLOWED_SITE_ORIGINS = new Set(['https://tutlio.lt', 'https://tutlio.pl', 'https://tutlio.com']);

export function allowedInAppSupportSiteOrigin(value: unknown): string | null {
  return typeof value === 'string' && ALLOWED_SITE_ORIGINS.has(value) ? value : null;
}

export function inAppSupportStatusOrigin(row: InAppSupportStatusRow, fallback: string): string {
  const environment = row.environment && typeof row.environment === 'object' && !Array.isArray(row.environment)
    ? row.environment as { siteOrigin?: unknown } : null;
  return allowedInAppSupportSiteOrigin(environment?.siteOrigin) || fallback;
}

const COPY = {
  lt: {
    subject: 'Jūsų Tutlio užklausa',
    greeting: 'Sveiki',
    registered: 'Jūsų ticketas užregistruotas.',
    in_progress: 'Jūsų ticketas vykdomas.',
    resolved: 'Jūsų ticketas išspręstas.',
    deadline: 'Planuojamas terminas',
    track: 'Stebėti būseną',
    reference: 'Užklausos numeris',
  },
  en: {
    subject: 'Your Tutlio ticket',
    greeting: 'Hello',
    registered: 'Your ticket has been registered.',
    in_progress: 'Your ticket is in progress.',
    resolved: 'Your ticket has been resolved.',
    deadline: 'Expected deadline',
    track: 'Track status',
    reference: 'Ticket reference',
  },
  pl: {
    subject: 'Twoje zgłoszenie Tutlio',
    greeting: 'Cześć',
    registered: 'Twoje zgłoszenie zostało zarejestrowane.',
    in_progress: 'Trwają prace nad Twoim zgłoszeniem.',
    resolved: 'Twoje zgłoszenie zostało rozwiązane.',
    deadline: 'Planowany termin',
    track: 'Śledź status',
    reference: 'Numer zgłoszenia',
  },
  nl: {
    subject: 'Je Tutlio-ticket',
    greeting: 'Hallo',
    registered: 'Je ticket is geregistreerd.',
    in_progress: 'Je ticket wordt behandeld.',
    resolved: 'Je ticket is opgelost.',
    deadline: 'Verwachte deadline',
    track: 'Status bekijken',
    reference: 'Ticketnummer',
  },
} as const;

function language(locale: string): keyof typeof COPY {
  const code = locale.toLowerCase().split(/[-_]/)[0];
  return code === 'lt' || code === 'pl' || code === 'nl' ? code : 'en';
}

export function inAppSupportReference(id: string): string {
  return `SUP-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function inAppSupportStatusSignature(row: InAppSupportStatusRow): string {
  return createHash('sha256')
    .update(`${row.id}|${row.status}|${row.target_date || ''}|${row.status_updated_at}`)
    .digest('hex');
}

export function buildInAppSupportStatusEmail(row: InAppSupportStatusRow, appUrl: string) {
  const locale = language(row.locale);
  const copy = COPY[locale];
  const origin = appUrl.trim().replace(/\/$/, '') || 'https://tutlio.lt';
  const trackingUrl = `${origin}${supportTicketsPageForPath(row.page)}?ticket=${encodeURIComponent(row.id)}`;
  const reference = inAppSupportReference(row.id);
  const statusText = copy[row.status];
  const due = row.status === 'in_progress' && row.target_date
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'Europe/Vilnius' }).format(new Date(row.target_date))
    : null;
  return {
    subject: `${copy.subject} ${reference}: ${statusText}`,
    html: `<div style="margin:0;padding:32px 12px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:600px;margin:0 auto;padding:30px;border:1px solid #e2e8f0;border-radius:18px;background:white">
        <p style="font-size:15px">${escapeSupportHtml(copy.greeting)}${row.reporter_name ? `, ${escapeSupportHtml(row.reporter_name)}` : ''},</p>
        <h1 style="font-size:22px;color:#312e81">${escapeSupportHtml(statusText)}</h1>
        <p style="font-size:15px;line-height:1.6">${escapeSupportHtml(row.title)}</p>
        <p style="font-size:14px"><strong>${escapeSupportHtml(copy.reference)}:</strong> ${escapeSupportHtml(reference)}</p>
        ${due ? `<p style="font-size:14px"><strong>${escapeSupportHtml(copy.deadline)}:</strong> ${escapeSupportHtml(due)}</p>` : ''}
        <a href="${escapeSupportHtml(trackingUrl)}" style="display:inline-block;margin-top:14px;padding:12px 18px;border-radius:10px;background:#4f46e5;color:white;text-decoration:none;font-weight:700">${escapeSupportHtml(copy.track)}</a>
      </div>
    </div>`,
    trackingUrl,
  };
}

export async function notifyInAppSupportStatus(db: SupabaseClient, row: InAppSupportStatusRow): Promise<boolean> {
  const signature = inAppSupportStatusSignature(row);
  if (row.status_notified_signature === signature) return false;
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('Status notification email is not configured.');
  const appUrl = inAppSupportStatusOrigin(row, process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');
  const email = buildInAppSupportStatusEmail(row, appUrl);
  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: getFromEmail(),
      to: row.reporter_email,
      replyTo: INTERNAL_NOTIFY_EMAILS,
      subject: email.subject,
      html: email.html,
    }, { idempotencyKey: `in-app-support-status-${row.id}-${signature.slice(0, 24)}` });
    if (error || !data?.id) throw new Error(error?.message || 'Email provider did not confirm delivery.');
    const { error: updateError } = await db.from('in_app_support_requests').update({
      status_notified_signature: signature,
      status_notified_at: new Date().toISOString(),
      status_notification_email_id: data.id.slice(0, 500),
      status_notification_error: null,
      ...(row.status === 'resolved' ? {
        completion_notified_at: new Date().toISOString(),
        completion_notification_email_id: data.id.slice(0, 500),
      } : {}),
    }).eq('id', row.id).eq('status_updated_at', row.status_updated_at);
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    await db.from('in_app_support_requests').update({
      status_notification_error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    }).eq('id', row.id).eq('status_updated_at', row.status_updated_at);
    throw error;
  }
}
