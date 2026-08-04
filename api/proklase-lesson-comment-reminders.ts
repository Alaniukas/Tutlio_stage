// Cron: Pro Klasė — remind tutors about missing lesson comments and apply -10€ penalties after 48h.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyCronAuth } from './_lib/cronAuth.js';
import { isProKlaseOrg, PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID } from './_lib/marketMoney.js';
import { PRO_KLASE_MISSING_REPORT_PENALTY_EUR } from './_lib/proKlaseTutorPay.js';

const PRO_KLASE_ORG_IDS = [PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = Date.now();
  const reminderCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const penaltyCutoff = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  let reminders = 0;
  let penalties = 0;

  for (const orgId of PRO_KLASE_ORG_IDS) {
    if (!isProKlaseOrg(orgId)) continue;

    const { data: tutors } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('organization_id', orgId);

    for (const tutor of tutors || []) {
      const tutorId = tutor.id as string;

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, end_time, tutor_comment, status')
        .eq('tutor_id', tutorId)
        .in('status', ['completed', 'no_show'])
        .lte('end_time', reminderCutoff)
        .is('tutor_comment', null);

      const missing = (sessions || []).filter((s) => !String(s.tutor_comment || '').trim());

      for (const session of missing) {
        const endMs = new Date(String(session.end_time)).getTime();
        if (!Number.isFinite(endMs)) continue;

        if (endMs <= new Date(penaltyCutoff).getTime()) {
          const { data: existing } = await supabase
            .from('tutor_adjustments')
            .select('id')
            .eq('session_id', session.id)
            .eq('type', 'penalty_missing_report')
            .maybeSingle();
          if (!existing) {
            await supabase.from('tutor_adjustments').insert({
              organization_id: orgId,
              tutor_id: tutorId,
              session_id: session.id,
              type: 'penalty_missing_report',
              amount_eur: PRO_KLASE_MISSING_REPORT_PENALTY_EUR,
              reason: 'Automatinė bauda: neparašytas komentaras po pamokos',
            });
            penalties += 1;
          }
        } else if (tutor.email) {
          reminders += 1;
        }
      }
    }
  }

  return res.status(200).json({ success: true, reminders, penalties });
}
