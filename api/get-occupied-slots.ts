import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

/** Max rows per request — wide date ranges remain bounded server-side */
const OCCUPIED_SESSIONS_LIMIT = 2000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const { tutorId, studentId, start, end } = req.body || {};
  if (!tutorId || !studentId || !start || !end) {
    return res.status(400).json({ error: 'tutorId, studentId, start, end are required' });
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const authUserId = userData.user.id;

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const [{ data: access }, { data: parentProfile }] = await Promise.all([
      serviceClient
        .from('students')
        .select('id, linked_user_id')
        .eq('id', studentId)
        .eq('tutor_id', tutorId)
        .maybeSingle(),
      serviceClient.from('parent_profiles').select('id').eq('user_id', authUserId).maybeSingle(),
    ]);

    if (!access) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const isLinkedStudent = access.linked_user_id === authUserId;

    let isParent = false;
    if (!isLinkedStudent && parentProfile?.id) {
      const { data: ps } = await serviceClient
        .from('parent_students')
        .select('id')
        .eq('parent_id', parentProfile.id)
        .eq('student_id', studentId)
        .maybeSingle();
      isParent = !!ps;
    }

    if (!isLinkedStudent && !isParent) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: sessions, error: sessionsErr } = await serviceClient
      .from('sessions')
      .select('id, start_time, end_time, subject_id, available_spots')
      .eq('tutor_id', tutorId)
      .neq('student_id', studentId)
      .neq('status', 'cancelled')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time', { ascending: true })
      .limit(OCCUPIED_SESSIONS_LIMIT);

    if (sessionsErr) {
      return res.status(500).json({ error: sessionsErr.message });
    }

    return res.status(200).json({ success: true, slots: sessions || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
