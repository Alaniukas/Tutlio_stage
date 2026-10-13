import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types.js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { runStudentRegistrationReminders } from './_lib/studentRegistrationReminders.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronAuth(req, res)) return;
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return res.status(200).json(await runStudentRegistrationReminders(db, publicOriginFromRequest(req)));
  } catch (error) {
    console.error('[registration-reminders]', error);
    return res.status(500).json({ error: 'Registration reminders failed' });
  }
}
