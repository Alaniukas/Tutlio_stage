import type { VercelRequest, VercelResponse } from './types.js';
import { isCronAuthorized } from './_lib/cronAuth.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';
import { retryPendingInAppSupportReleases } from './_lib/inAppSupportRelease.js';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Unlike local convenience cron helpers, delivery of customer mail always fails closed.
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.SUPPORT_RELEASE_WEBHOOK_SECRET?.trim()) {
    return res.status(200).json({ ok: true, ignored: 'release_completion_disabled' });
  }
  try {
    const result = await retryPendingInAppSupportReleases(getSupportServiceClient(), { deadlineAt: Date.now() + 22_000, limit: 20 });
    return res.status(result.pending ? 503 : 200).json({ ok: result.pending === 0, ...result });
  } catch {
    console.error('[retry-support-releases] Pending release delivery failed.');
    return res.status(503).json({ error: 'Could not retry support release delivery' });
  }
}
