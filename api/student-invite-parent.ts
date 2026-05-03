import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { insertParentInviteAndSendEmail } from './_lib/parentInvite.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server configuration error' });

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error: rpcErr } = await supabase.rpc('get_student_by_user_id', {
    p_user_id: auth.userId,
  });
  if (rpcErr) {
    console.warn('[student-invite-parent] get_student_by_user_id', rpcErr);
    return res.status(500).json({ error: 'Could not resolve student' });
  }
  const st = rows?.[0] as { id?: string } | undefined;
  if (!st?.id) {
    return res.status(404).json({ error: 'No student linked to this account' });
  }

  const { data: studentRow, error: stErr } = await supabase
    .from('students')
    .select('id, full_name, payer_email, payer_name, payment_payer')
    .eq('id', st.id)
    .maybeSingle();

  if (stErr || !studentRow) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const { data: regParents } = await supabase.rpc('get_registered_parents_for_linked_student', {
    p_student_id: studentRow.id as string,
    p_linked_user_id: auth.userId,
  });
  if (Array.isArray(regParents) && regParents.length > 0) {
    return res.status(409).json({
      error: 'parent_already_registered',
      parents: regParents,
    });
  }

  const emailRaw = String(studentRow.payer_email ?? '').trim();
  if (!emailRaw.includes('@')) {
    return res.status(400).json({
      error: 'No payer email on file. Ask your tutor or school administrator to add a parent email.',
    });
  }

  const payer = String(studentRow.payment_payer ?? '').trim().toLowerCase();
  if (payer && payer !== 'parent') {
    return res.status(400).json({
      error: 'Parent portal invite only applies when the payer is set to parent / guardian.',
    });
  }

  const result = await insertParentInviteAndSendEmail({
    supabase,
    appUrl: APP_URL,
    parentEmail: emailRaw,
    studentId: studentRow.id as string,
    studentFullName: String(studentRow.full_name || ''),
    parentName: (studentRow.payer_name as string | null) ?? null,
    source: 'student_self',
    invitedByUserId: auth.userId,
  });

  if ('error' in result) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({ success: true });
}
