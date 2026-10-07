// Cron (fan-out from /api/send-reminders): warn tutors and school admins when a class
// group's upcoming slot is within ~7 days but confirmed contracts are still below minimum.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { runSchoolGroupMinimumWarnings } from './_lib/schoolGroupMinimumWarnings.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APP_ORIGIN = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  try {
    const result = await runSchoolGroupMinimumWarnings(supabase, APP_ORIGIN);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[school-group-minimum-warnings]', message);
    return res.status(500).json({ error: message });
  }
}
