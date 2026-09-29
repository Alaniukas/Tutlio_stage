import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';
import { parseSupportVercelLogBatch } from './_lib/supportVercelLogs.js';

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const LOG_RETENTION_DAYS = 14;

export const config = { api: { bodyParser: false } };

class BodyTooLargeError extends Error {}

async function rawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_BODY_BYTES) throw new BodyTooLargeError('Vercel log batch exceeds the size limit.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

export function validVercelDrainSignature(raw: Buffer, signature: unknown, secret: string): boolean {
  if (typeof signature !== 'string' || !/^[a-f0-9]{40}$/i.test(signature) || !secret) return false;
  const expected = createHmac('sha1', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.VERCEL_LOG_DRAIN_SECRET?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!secret || !projectId) return res.status(503).json({ error: 'Vercel log drain is not configured' });

  let bytes: Buffer;
  try {
    bytes = await rawBody(req);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return res.status(413).json({ error: 'Log batch is too large' });
    return res.status(400).json({ error: 'Could not read log batch' });
  }
  if (!validVercelDrainSignature(bytes, req.headers['x-vercel-signature'], secret)) {
    return res.status(403).json({ error: 'Invalid log drain signature' });
  }

  let rows;
  try {
    rows = parseSupportVercelLogBatch(JSON.parse(bytes.toString('utf8')), projectId);
  } catch {
    return res.status(400).json({ error: 'Invalid Vercel log batch' });
  }
  if (rows.length === 0) return res.status(200).json({ ok: true, accepted: 0 });

  try {
    const db = getSupportServiceClient();
    for (let index = 0; index < rows.length; index += 250) {
      const { error } = await db.from('support_vercel_log_events').upsert(rows.slice(index, index + 250), {
        onConflict: 'project_id,log_id',
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }
    try {
      const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await db.from('support_vercel_log_events').delete().lt('occurred_at', cutoff);
    } catch {
      // A cleanup failure must not cause Vercel to resend an accepted batch.
    }
  } catch {
    // Logging an ingestion failure here would itself be delivered by this drain
    // and could cause a feedback loop while the database is unavailable.
    return res.status(500).json({ error: 'Could not save log batch' });
  }
  return res.status(200).json({ ok: true, accepted: rows.length });
}
