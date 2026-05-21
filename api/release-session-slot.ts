// POST /api/release-session-slot — create one-time availability from a freed lesson slot (tutor / org admin)

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { canTutorSideCancelSession } from './_lib/cancel-session-access.js';
import { releaseSessionSlotAsAvailability } from './_lib/release-session-availability.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { tutorId, startTime, endTime, subjectId } = req.body as {
    tutorId?: string;
    startTime?: string;
    endTime?: string;
    subjectId?: string | null;
  };

  if (!tutorId || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing tutorId, startTime, or endTime' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!auth.isInternal) {
    const userId = auth.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let isOrgAdminForTutorOrg = false;
    const { data: tutorRow } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', tutorId)
      .maybeSingle();
    const orgId = (tutorRow as { organization_id?: string | null } | null)?.organization_id;
    if (orgId) {
      const { data: orgAdmin } = await supabase
        .from('organization_admins')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .maybeSingle();
      isOrgAdminForTutorOrg = !!orgAdmin;
    }
    if (!canTutorSideCancelSession(userId, tutorId, isOrgAdminForTutorOrg)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  try {
    const result = await releaseSessionSlotAsAvailability(supabase, {
      tutorId,
      startTime,
      endTime,
      subjectId: subjectId ?? null,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error('[release-session-slot]', e);
    return res.status(500).json({ error: 'Failed to release slot' });
  }
}
