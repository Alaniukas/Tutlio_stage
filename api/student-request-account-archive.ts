import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { studentBelongsToMoksloVaisiai } from './_lib/moksloVaisiaiStudentArchive.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

async function loadLinkedStudent(sb: ReturnType<typeof serviceClient>, userId: string, studentId: string) {
  const { data: student } = await sb
    .from('students')
    .select('id, organization_id, linked_user_id, tutor_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student || student.linked_user_id !== userId) return null;

  let tutorOrganizationId: string | null = null;
  let tutorOrganizationSlug: string | null = null;
  if (student.tutor_id) {
    const { data: tutor } = await sb
      .from('profiles')
      .select('organization_id')
      .eq('id', student.tutor_id)
      .maybeSingle();
    tutorOrganizationId = tutor?.organization_id ?? null;
    if (tutorOrganizationId) {
      const { data: org } = await sb
        .from('organizations')
        .select('slug')
        .eq('id', tutorOrganizationId)
        .maybeSingle();
      tutorOrganizationSlug = org?.slug ?? null;
    }
  }

  return { student, tutorOrganizationId, tutorOrganizationSlug };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const studentId =
    (typeof req.query.studentId === 'string' ? req.query.studentId : '') ||
    String((req.body as { studentId?: string } | undefined)?.studentId || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Missing studentId' });

  const sb = serviceClient();
  const linked = await loadLinkedStudent(sb, auth.userId, studentId);
  if (!linked) return res.status(404).json({ error: 'Student not found' });

  const isMv = studentBelongsToMoksloVaisiai({
    studentOrganizationId: linked.student.organization_id,
    tutorOrganizationId: linked.tutorOrganizationId,
    tutorOrganizationSlug: linked.tutorOrganizationSlug,
  });
  if (!isMv) {
    return res.status(403).json({ error: 'Archive is only available for Mokslo vaisiai students' });
  }

  return res.status(403).json({
    error: 'parent_consent_required',
    parentConsentRequired: true,
  });
}
