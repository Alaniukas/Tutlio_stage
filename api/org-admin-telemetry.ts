import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { getTelemetryServiceClient, telemetryRpcArgs } from './_lib/orgAdminTelemetry.js';
import { parseTelemetryBatch } from '../src/lib/orgAdminTelemetryShared.js';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    if (Buffer.byteLength(JSON.stringify(req.body) || '') > 24_000) return res.status(413).json({ error: 'Telemetry batch is too large' });
    const batch = parseTelemetryBatch(req.body);
    if (!batch) return res.status(400).json({ error: 'Invalid telemetry batch' });
    const auth = await verifyRequestAuth(req);
    if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });
    const db = getTelemetryServiceClient();
    const access = await getOrgAdminAccessByUserId(db, auth.userId);
    if (!access) return res.status(403).json({ error: 'Organization access is inactive' });
    // IDs and the login timestamp come from verified server context, never the payload.
    const { data, error } = await db.rpc('record_org_admin_telemetry', telemetryRpcArgs(batch, access.organizationId, auth.userId, auth.lastSignInAt || null));
    if (error?.code === '42501') return res.status(403).json({ error: 'Organization access is inactive' });
    if (error) return res.status(503).json({ error: 'Telemetry is temporarily unavailable' });
    return res.status(200).json(data);
  } catch {
    // Never log failures of the logging endpoint into its own ingestion pipeline.
    return res.status(503).json({ error: 'Telemetry is temporarily unavailable' });
  }
}
