import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, fullName, password } = req.body as {
    token: string;
    fullName: string;
    password: string;
  };

  if (!token || !fullName || !password || password.length < 6) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const { data: invite, error: invErr } = await supabase
    .from('parent_invites')
    .select('id, parent_email, student_id, used')
    .eq('token', token)
    .maybeSingle();

  if (invErr || !invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.used) return res.status(400).json({ error: 'Invite already used' });

  // Create Supabase auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: invite.parent_email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    if (authErr.message?.includes('already registered') || authErr.message?.includes('already been registered')) {
      // User exists — look up their ID and link
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const existing = users?.find((u: any) => u.email === invite.parent_email);
      if (existing) {
        await linkParent(existing.id, fullName, invite.student_id, invite.id);
        return res.status(200).json({ success: true });
      }
    }
    return res.status(400).json({ error: authErr.message });
  }

  if (!authData.user) return res.status(500).json({ error: 'User creation failed' });

  await linkParent(authData.user.id, fullName, invite.student_id, invite.id);

  return res.status(200).json({ success: true });
}

async function linkParent(userId: string, fullName: string, studentId: string, inviteId: string) {
  // Create parent profile (upsert to handle existing)
  await supabase
    .from('parent_profiles')
    .upsert({ user_id: userId, full_name: fullName }, { onConflict: 'user_id' });

  // Link parent to student
  await supabase
    .from('parent_students')
    .upsert({ parent_id: userId, student_id: studentId }, { onConflict: 'parent_id,student_id' });

  // Update student's parent_user_id
  await supabase
    .from('students')
    .update({ parent_user_id: userId })
    .eq('id', studentId);

  // Mark invite as used
  await supabase
    .from('parent_invites')
    .update({ used: true })
    .eq('id', inviteId);
}
