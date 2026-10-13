import type { VercelRequest, VercelResponse } from './types.js';
import { getTelemetryServiceClient, isTelemetryPlatformAdmin } from './_lib/orgAdminTelemetry.js';
import { getCorrelatedSupportVercelLogs } from './_lib/supportVercelLogs.js';
import { enrichTelemetryReport, UUID_PATTERN, type TelemetryReport } from '../src/lib/orgAdminTelemetryShared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isTelemetryPlatformAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const organizationId = typeof req.query.organization === 'string' ? req.query.organization : null;
  if (organizationId && !UUID_PATTERN.test(organizationId)) return res.status(400).json({ error: 'Invalid organization' });
  const number = (value: unknown, fallback: number, max: number) => typeof value === 'string' && /^\d{1,7}$/.test(value) ? Math.min(max, Number(value)) : fallback;
  try {
    const db = getTelemetryServiceClient();
    const { data, error } = await db.rpc('org_admin_usage_report', {
      p_organization_id: organizationId, p_limit: Math.max(1, number(req.query.limit, 25, 50)),
      p_offset: number(req.query.offset, 0, 100_000), p_search: typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '',
      p_include_demo: organizationId !== null || req.query.includeDemo === 'true', p_project_id: process.env.VERCEL_PROJECT_ID || null,
    });
    if (error || !data) return res.status(503).json({ error: 'Usage analytics are unavailable. Apply the admin telemetry migration before release.' });
    const report = enrichTelemetryReport(data as TelemetryReport);
    if (organizationId) {
      const ids = report.errors.flatMap(group => group.sample?.vercelId ? [group.sample.vercelId] : []);
      try { report.correlated_logs = await getCorrelatedSupportVercelLogs(ids); } catch { report.correlated_logs = []; }
    }
    return res.status(200).json(report);
  } catch {
    return res.status(503).json({ error: 'Usage analytics are temporarily unavailable' });
  }
}
