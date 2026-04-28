import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase service env vars' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { parentEmail, studentId, parentName } = req.body as {
    parentEmail: string;
    studentId: string;
    parentName?: string;
  };

  if (!parentEmail || !studentId) {
    return res.status(400).json({ error: 'parentEmail and studentId are required' });
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, tutor_id')
    .eq('id', studentId)
    .single();

  if (!student) return res.status(404).json({ error: 'Student not found' });

  const token = crypto.randomUUID().split('-')[0].toUpperCase();

  const { error: insertErr } = await supabase
    .from('parent_invites')
    .insert({
      token,
      parent_email: parentEmail,
      parent_name: parentName || null,
      student_id: studentId,
      used: false,
    });

  if (insertErr) {
    console.error('[create-parent-invite]', insertErr);
    return res.status(500).json({ error: insertErr.message });
  }

  const registerLink = `${APP_URL}/parent-register?token=${token}`;

  try {
    await fetch(`${APP_URL}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: 'parent_invite',
        to: parentEmail,
        data: {
          parentName: parentName || '',
          studentName: student.full_name,
          registerLink,
          token,
        },
      }),
    });
  } catch (err) {
    console.error('[create-parent-invite] email error:', err);
  }

  return res.status(200).json({ success: true, token });
}
