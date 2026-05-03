import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { insertParentInviteAndSendEmail, type ParentInviteSource } from './_lib/parentInvite.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

/**
 * Legacy/server-only: use `x-internal-key` (service role) or POST from register-student /
 * student-invite-parent. Anonymous browser calls are rejected.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.isInternal) {
    return res.status(401).json({
      error:
        'Unauthorized. Use POST /api/student-invite-parent as a logged-in student, or invoke from server with x-internal-key.',
    });
  }

  const supabaseUrlRaw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // allow alternative env name used in some deployments
  const serviceRoleKeyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  const supabaseUrl = (supabaseUrlRaw || '').trim();
  const serviceRoleKey = (serviceRoleKeyRaw || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase service env vars' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    parentEmail,
    studentId,
    parentName,
    source,
    invitedByUserId,
  } = req.body as {
    parentEmail: string;
    studentId: string;
    parentName?: string;
    source?: ParentInviteSource;
    invitedByUserId?: string | null;
  };

  if (!parentEmail || !studentId) {
    return res.status(400).json({ error: 'parentEmail and studentId are required' });
  }

  const { data: student, error: stErr } = await supabase
    .from('students')
    .select('id, full_name, tutor_id')
    .eq('id', studentId)
    .single();

  if (stErr || !student) return res.status(404).json({ error: 'Student not found' });

  const result = await insertParentInviteAndSendEmail({
    supabase,
    appUrl: APP_URL,
    parentEmail,
    studentId,
    studentFullName: student.full_name || '',
    parentName: parentName ?? null,
    source: source ?? null,
    invitedByUserId: invitedByUserId ?? null,
  });

  if ('error' in result) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({ success: true, token: result.token, code: result.code });
}
