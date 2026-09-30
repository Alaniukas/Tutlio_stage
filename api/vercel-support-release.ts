import type { VercelRequest, VercelResponse } from './types.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';
import { applyInAppSupportRelease } from './_lib/inAppSupportRelease.js';
import { loadSupportReleaseManifest } from './_lib/inAppSupportReleaseManifest.js';
import {
  getSupportReleaseVercelSettings, parseSupportPromotionEvent, validSupportReleaseSignature,
  verifySupportProductionPromotion,
} from './_lib/supportReleaseVercel.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const MAX_BODY_BYTES = 256 * 1024;
class BodyTooLargeError extends Error {}

async function rawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const deadlineAt = Date.now() + 22_000;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const settings = getSupportReleaseVercelSettings();
  if (!settings) return res.status(503).json({ error: 'Support release webhook is not configured' });
  let raw: Buffer;
  try { raw = await rawBody(req); }
  catch (error) {
    return res.status(error instanceof BodyTooLargeError ? 413 : 400).json({ error: 'Could not read release event' });
  }
  if (!validSupportReleaseSignature(raw, req.headers['x-vercel-signature'], settings.secret)) {
    return res.status(403).json({ error: 'Invalid release webhook signature' });
  }
  let event;
  try { event = parseSupportPromotionEvent(JSON.parse(raw.toString('utf8'))); }
  catch { return res.status(400).json({ error: 'Invalid release event' }); }
  if (!event) return res.status(200).json({ ok: true, ignored: 'other_event' });
  if (event.projectId !== settings.projectId) return res.status(200).json({ ok: true, ignored: 'other_project' });
  try {
    const manifest = loadSupportReleaseManifest();
    const verification = await verifySupportProductionPromotion(event, settings, manifest.productionBranch);
    if (verification.verified === false) return res.status(200).json({ ok: true, ignored: verification.reason });
    if (!manifest.ticketIds.length) return res.status(200).json({ ok: true, ignored: 'empty_release' });
    const result = await applyInAppSupportRelease(getSupportServiceClient(), {
      releaseId: manifest.releaseId!, ticketIds: manifest.ticketIds,
      deploymentId: event.deploymentId, eventId: event.eventId, gitSha: verification.gitSha, deadlineAt,
    });
    if (result.pending) {
      res.setHeader('Retry-After', '30');
      return res.status(503).json({ error: 'Release delivery is pending', ...result });
    }
    return res.status(200).json({ ok: true, ...result });
  } catch {
    // Avoid logging provider bodies or ticket details from a release callback.
    console.error('[vercel-support-release] Production verification or release processing failed.');
    res.setHeader('Retry-After', '30');
    return res.status(503).json({ error: 'Could not complete support release; retry required' });
  }
}
