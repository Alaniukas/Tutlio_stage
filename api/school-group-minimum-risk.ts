// Staff-only: groups below minimum with an upcoming slot in the next ~7 days.

import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import {
  formatSchoolGroupOccurrenceLt,
  loadSchoolGroupMinimumRiskCandidates,
  orgHasSchoolClassGroups,
} from './_lib/schoolGroupMinimumWarnings.js';
import { evaluateSchoolGroupMinimumRisk } from '../src/lib/schoolGroupMinimumAtRisk.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = serviceSupabase();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', auth.userId)
    .maybeSingle();
  if (profileError) return res.status(500).json({ error: profileError.message });

  const adminAccess = await getOrgAdminAccessByUserId(supabase, auth.userId);
  const organizationId = adminAccess?.organizationId || profile?.organization_id || null;
  if (!organizationId) return res.status(403).json({ error: 'Forbidden' });

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, features')
    .eq('id', organizationId)
    .maybeSingle();
  if (orgError) return res.status(500).json({ error: orgError.message });
  if (!org || !orgHasSchoolClassGroups(org.features)) {
    return res.status(200).json({ groups: [] });
  }

  const tutorOnly = !adminAccess;
  const groups = await loadSchoolGroupMinimumRiskCandidates(
    supabase,
    organizationId,
    tutorOnly ? { tutorId: auth.userId } : undefined,
  );
  const now = new Date();
  const atRisk = groups
    .map((group) => {
      const risk = evaluateSchoolGroupMinimumRisk(group, now);
      if (!risk.atRisk || !risk.occurrenceStart) return null;
      return {
        id: group.id,
        name: group.name,
        tutorName: group.tutor_name || group.tutor?.full_name || '',
        eligibleCount: risk.eligibleCount,
        minimum: risk.minimum,
        occurrenceStart: risk.occurrenceStart.toISOString(),
        occurrenceLabel: formatSchoolGroupOccurrenceLt(risk.occurrenceStart),
      };
    })
    .filter(Boolean);

  return res.status(200).json({ groups: atRisk });
}
