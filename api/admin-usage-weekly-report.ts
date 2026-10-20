import type { VercelRequest, VercelResponse } from './types.js';
import { Resend } from './_lib/resendClient.js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { getTelemetryServiceClient } from './_lib/orgAdminTelemetry.js';
import { buildWeeklyDigest, buildWeeklyDigestEmail, fetchFullTelemetryReport } from './_lib/adminUsageWeeklyReport.js';
import { getFromEmail, getResendApiKey, INTERNAL_NOTIFY_EMAILS } from './_lib/resendConfig.js';

const DAY_MS = 86_400_000;

function isoWeekKey(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCronAuth(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = getResendApiKey();
  if (!apiKey) return res.status(503).json({ error: 'Email is not configured' });

  try {
    const db = getTelemetryServiceClient();
    const report = await fetchFullTelemetryReport(db, process.env.VERCEL_PROJECT_ID || null);
    if (!report) {
      return res.status(503).json({
        error: 'Admin usage analytics are unavailable. Apply migration 20261013170213_org_admin_usage_telemetry.sql and enable production telemetry.',
      });
    }

    const digest = buildWeeklyDigest(report);
    const { subject, html } = buildWeeklyDigestEmail(digest);
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: INTERNAL_NOTIFY_EMAILS,
      subject,
      html,
      headers: {
        'Idempotency-Key': `admin-usage-weekly-${isoWeekKey()}`,
      },
    });
    if (error) {
      console.error('[admin-usage-weekly-report] Resend error:', error);
      return res.status(502).json({ error: 'Could not send weekly admin usage email' });
    }

    return res.status(200).json({
      ok: true,
      emailId: data?.id || null,
      organizations: digest.organizationCount,
      inactive_warning: digest.inactiveAdmins.filter((row) => row.tier === 'warning' || row.tier === 'unknown').length,
      inactive_alert: digest.inactiveAdmins.filter((row) => row.tier === 'alert').length,
    });
  } catch (error) {
    console.error('[admin-usage-weekly-report]', error);
    return res.status(500).json({ error: 'Weekly admin usage report failed' });
  }
}
