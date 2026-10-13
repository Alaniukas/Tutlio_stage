import type { VercelRequest, VercelResponse } from './types.js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { getTelemetryServiceClient } from './_lib/orgAdminTelemetry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCronAuth(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data, error } = await getTelemetryServiceClient().rpc('cleanup_org_admin_telemetry');
    if (error) return res.status(503).json({ error: 'Telemetry cleanup failed' });
    return res.status(200).json({ ok: true, ...data });
  } catch { return res.status(503).json({ error: 'Telemetry cleanup failed' }); }
}
