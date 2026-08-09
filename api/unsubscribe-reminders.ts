// POST /api/unsubscribe-reminders
// Body: { email: string }
// Public endpoint — no auth. Opts the email out of automated reminder emails.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { upsertReminderOptOut } from './_lib/reminderOptOut.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const email = String((req.body as { email?: string })?.email || '').trim();
  if (!email || !email.includes('@') || email.length > 254) {
    return json(res, 400, { error: 'Invalid email' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const result = await upsertReminderOptOut(supabase, email, 'footer_page');
    return json(res, 200, { ok: true, email: result.email });
  } catch (e: any) {
    console.error('[unsubscribe-reminders]', e?.message || e);
    return json(res, 500, { error: e?.message || 'Failed to unsubscribe' });
  }
}
