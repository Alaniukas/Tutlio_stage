import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';

/** Load the organization's taught subjects, regardless of which tutor created them. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const access = await requireOrgAdminAccess(req, db, 'students.view');
  if ('status' in access) return res.status(access.status).json({ error: access.error });
  const { data: tutors, error } = await db.from('profiles').select('id, full_name')
    .eq('organization_id', access.access.organizationId);
  if (error) return res.status(500).json({ error: 'Nepavyko įkelti mokytojų.' });
  if (!tutors?.length) return res.status(200).json({ subjects: [] });
  const { data: subjects, error: subjectError } = await db.from('subjects')
    .select('id, name, tutor_id, duration_minutes, price, meeting_link')
    .in('tutor_id', tutors.map(t => t.id)).or('is_group.eq.false,is_group.is.null').order('name');
  if (subjectError) return res.status(500).json({ error: 'Nepavyko įkelti dalykų.' });
  return res.status(200).json({ subjects: (subjects || []).map(s => ({ ...s, tutor_name: tutors.find(t => t.id === s.tutor_id)?.full_name || null })) });
}
