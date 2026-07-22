/**
 * Poll a signing transaction and advance the contract. Called (repeatedly) by
 * the SPA return page that GoSign redirects to after signing — for both the
 * directorė and parents. Idempotent; authorized by the per-signer token.
 *
 * On a completed signature it stores the signed PDF and either invites the next
 * signer (school → parent(s)) or finalizes the contract (→ signing_status
 * 'signed', which the payment flow gates on).
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { isGoSignConfigured, goSignNotConfiguredMessage } from './_lib/gosignConfig.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { pollAndAdvance } from './_lib/schoolContractSigning.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!isGoSignConfigured()) return json(res, 503, { error: goSignNotConfiguredMessage() });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) return json(res, 400, { error: 'Missing token' });

  try {
    // The SPA return page re-calls this endpoint every ~3 s for up to 2 min, so
    // a couple of GoSign checks per request suffice — a long internal poll here
    // would only risk hitting the function's maxDuration while RC is slow.
    const result = await pollAndAdvance(supabase, token, publicOriginFromRequest(req), { attempts: 2 });
    if (result.status === 'not_found') return json(res, 404, { error: 'Invalid link' });
    return json(res, 200, result);
  } catch (e: any) {
    console.error('[school-contract-sign-callback]', e?.message || e);
    return json(res, 502, { error: `Could not finalize signing: ${e?.message || 'unknown error'}` });
  }
}
