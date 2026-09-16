import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import type {
  InAppSupportAttachment,
  InAppSupportSubmission,
} from '../../src/lib/inAppSupport.js';
import { escapeSupportHtml } from './supportContact.js';
import { getFromEmail, getResendApiKey, INTERNAL_NOTIFY_EMAILS } from './resendConfig.js';
import { SUPPORT_ATTACHMENT_BUCKET } from './supportPersistence.js';

export interface InAppSupportEmailReporter {
  userId: string;
  name: string | null;
  email: string;
  role: 'tutor' | 'organization_admin' | 'student' | 'parent';
  organizationId: string | null;
  organizationName: string | null;
}

export interface InAppSupportEmailAttachment extends InAppSupportAttachment {
  signedUrl: string | null;
}

export interface InAppSupportNotificationEmailInput {
  id: string;
  reference: string;
  createdAt: string;
  reporter: InAppSupportEmailReporter;
  report: InAppSupportSubmission;
  attachments: InAppSupportEmailAttachment[];
  adminUrl: string;
}

function html(value: string | null | undefined): string {
  return escapeSupportHtml(value || '—');
}

function multiline(value: string | null | undefined): string {
  return html(value).replace(/\n/g, '<br>');
}

function row(label: string, value: string, alternate = false): string {
  return `<tr${alternate ? ' style="background:#f8fafc"' : ''}><td style="padding:8px 12px;font-weight:700;color:#64748b;width:155px;vertical-align:top">${html(label)}</td><td style="padding:8px 12px;color:#0f172a;vertical-align:top">${value}</td></tr>`;
}

function section(title: string, body: string): string {
  return `<h3 style="margin:24px 0 8px;color:#0f172a;font-size:15px">${html(title)}</h3><div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;line-height:1.6;background:#fff">${body}</div>`;
}

function roleLabel(role: InAppSupportEmailReporter['role']): string {
  if (role === 'organization_admin') return 'Organization administrator';
  if (role === 'student') return 'Student';
  if (role === 'parent') return 'Parent';
  return 'Tutor';
}

function impactLabel(impact: InAppSupportSubmission['impact'], incomplete = false): string {
  if (incomplete) return 'Not provided (manual triage)';
  if (impact === 'blocking') return 'Blocking';
  return impact.charAt(0).toUpperCase() + impact.slice(1);
}

export function buildInAppSupportNotificationEmail(input: InAppSupportNotificationEmailInput) {
  const { report, reporter } = input;
  const category = report.category === 'bug' ? 'BUG' : 'FEATURE REQUEST';
  const incomplete = report.environment.reportCompleteness === 'user_confirmed_incomplete';
  const steps = report.steps
    .map((step) => `<li style="margin:0 0 7px">${multiline(step)}</li>`)
    .join('');
  const transcript = report.transcript.length > 0
    ? report.transcript
      .map((message) => `<p style="margin:0 0 12px"><strong style="color:${message.role === 'user' ? '#4338ca' : '#0f766e'}">${message.role === 'user' ? 'User' : 'Tutlio support agent'}:</strong><br>${multiline(message.content)}</p>`)
      .join('')
    : '<p style="margin:0;color:#64748b">No transcript supplied.</p>';
  const attachments = input.attachments.length > 0
    ? `<ul style="margin:0;padding-left:20px">${input.attachments.map((attachment) => {
      const size = `${Math.max(1, Math.round(attachment.size / 1024))} KB`;
      return `<li style="margin:0 0 8px">${attachment.signedUrl
        ? `<a href="${html(attachment.signedUrl)}" style="color:#4338ca;font-weight:700">${html(attachment.name)}</a>`
        : `<strong>${html(attachment.name)}</strong>`} <span style="color:#64748b">(${html(attachment.type)}, ${size}${attachment.signedUrl ? ', private link expires in 7 days' : ''})</span></li>`;
    }).join('')}</ul>`
    : '<p style="margin:0;color:#64748b">No screenshots attached.</p>';
  const actualOutcome = report.category === 'bug'
    ? section('Actual outcome', multiline(report.actualOutcome))
    : '';
  const organization = reporter.organizationName
    ? `${html(reporter.organizationName)}${reporter.organizationId ? ` <span style="color:#64748b">(${html(reporter.organizationId)})</span>` : ''}`
    : reporter.organizationId ? html(reporter.organizationId) : '—';

  const emailHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#0f172a;background:#f8fafc">
      <div style="background:linear-gradient(135deg,#312e81,#4f46e5);border-radius:18px;padding:22px;color:#fff">
        <div style="display:inline-block;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:800;letter-spacing:.08em">TUTLIO ${category}</div>
        <h2 style="margin:12px 0 6px;font-size:22px;line-height:1.3">${html(report.title)}</h2>
        <p style="margin:0;color:#e0e7ff;font-size:13px">${html(input.reference)} · ${html(impactLabel(report.impact, incomplete))}</p>
      </div>

      ${incomplete ? '<div style="margin-top:16px;padding:13px 15px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13px;line-height:1.5"><strong>User requested immediate submission.</strong> Some structured details were not provided. Review the full conversation and screenshots before triage.</div>' : ''}

      <div style="margin-top:16px;padding:16px;border-radius:14px;background:#fff;border:1px solid #e2e8f0">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${row('Reporter', `${html(reporter.name || 'Unknown')} · <a href="mailto:${html(reporter.email)}" style="color:#4338ca">${html(reporter.email)}</a>`, true)}
          ${row('Account role', html(roleLabel(reporter.role)))}
          ${row('Organization', organization, true)}
          ${row('User ID', html(reporter.userId))}
          ${row('Reference', html(input.reference), true)}
          ${row('Submitted', html(input.createdAt))}
        </table>
      </div>

      ${section(report.category === 'bug' ? 'Problem and context' : 'User problem and context', multiline(report.context))}
      ${section(report.category === 'bug' ? 'Steps to reproduce' : 'Desired workflow', `<ol style="margin:0;padding-left:20px">${steps}</ol>`)}
      ${section('Expected outcome', multiline(report.expectedOutcome))}
      ${actualOutcome}
      ${section(`Impact: ${impactLabel(report.impact, incomplete)}`, multiline(report.impactDetails))}
      ${section('Screenshots', attachments)}

      <h3 style="margin:24px 0 8px;color:#0f172a;font-size:15px">Automatic technical context</h3>
      <div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${row('Page', html(report.page), true)}
          ${row('Portal', html(report.portal))}
          ${row('Locale', html(report.locale), true)}
          ${row('Browser / user agent', html(report.environment.userAgent))}
          ${row('Platform', html(report.environment.platform), true)}
          ${row('Viewport', html(report.environment.viewport))}
          ${row('Browser language', html(report.environment.language), true)}
          ${row('Occurred at', html(report.environment.occurredAt))}
          ${row('Request UUID', html(input.id), true)}
        </table>
      </div>

      ${section('Full support-agent conversation', transcript)}

      <div style="margin-top:24px;text-align:center">
        <a href="${html(input.adminUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:800">Open Tutlio admin dashboard</a>
        <p style="margin:8px 0 0;color:#64748b;font-size:12px">Choose “Support” to review, prioritize, and update this request.</p>
      </div>
    </div>
  `;

  return {
    subject: `[Tutlio support] ${category}${incomplete ? ' [NEEDS TRIAGE]' : ''} ${input.reference}: ${report.title.replace(/[\r\n]+/g, ' ')}`.slice(0, 240),
    html: emailHtml,
  };
}

export async function sendInAppSupportNotification(input: {
  db: SupabaseClient;
  id: string;
  reference: string;
  createdAt: string;
  reporter: InAppSupportEmailReporter;
  report: InAppSupportSubmission;
}): Promise<string | null> {
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('Team notification email is not configured.');

  const bucket = input.db.storage.from(SUPPORT_ATTACHMENT_BUCKET);
  const attachments: InAppSupportEmailAttachment[] = await Promise.all(input.report.attachments.map(async (attachment) => {
    const { data, error } = await bucket.createSignedUrl(attachment.path, 7 * 24 * 60 * 60);
    if (error) console.error('[in-app-support] Could not sign email attachment:', error);
    return { ...attachment, signedUrl: data?.signedUrl || null };
  }));
  const origin = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
  const email = buildInAppSupportNotificationEmail({
    id: input.id,
    reference: input.reference,
    createdAt: input.createdAt,
    reporter: input.reporter,
    report: input.report,
    attachments,
    adminUrl: `${origin}/admin`,
  });
  const reportVersion = createHash('sha256').update(JSON.stringify({
    category: input.report.category,
    title: input.report.title,
    context: input.report.context,
    steps: input.report.steps,
    expectedOutcome: input.report.expectedOutcome,
    actualOutcome: input.report.actualOutcome,
    impact: input.report.impact,
    impactDetails: input.report.impactDetails,
    page: input.report.page,
    attachments: input.report.attachments,
  })).digest('hex').slice(0, 24);

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: INTERNAL_NOTIFY_EMAILS,
    replyTo: input.reporter.email,
    subject: email.subject,
    html: email.html,
  }, { idempotencyKey: `in-app-support-${input.report.requestId}-${reportVersion}` });
  if (error) throw new Error(error.message || 'Could not notify the Tutlio team.');
  if (!data?.id) throw new Error('The email provider did not confirm the team notification.');
  console.info('[in-app-support] Team notification accepted by Resend:', {
    reference: input.reference,
    resendEmailId: data.id,
    recipientCount: INTERNAL_NOTIFY_EMAILS.length,
  });
  return data.id;
}
