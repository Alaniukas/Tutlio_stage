import type { VercelRequest, VercelResponse } from './types';
import { requireCronAuth } from './_lib/cronAuth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { processAcceptanceJob } from './_lib/schoolAcceptanceJobs.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronAuth(req, res)) return;
  const db = serviceSupabase();
  const { data, error } = await db.rpc('claim_school_acceptance');
  if (error) return res.status(503).json({ error: 'Acceptance queue unavailable' });
  if (!data?.[0]) return res.status(200).json({ ok: true, processed: 0 });
  try {
    const result = await processAcceptanceJob(db, req, data[0]);
    return res.status(200).json({ ok: true, processed: 1, ...result });
  } catch {
    // Uncertain DB outcome: keep the lease; the next worker reclaims after expiry.
    return res.status(503).json({ error: 'Acceptance state could not be saved; lease will expire' });
  }
}
