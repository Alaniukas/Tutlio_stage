import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Missing Supabase configuration' });

  // Note: this endpoint touches tables that may not exist in generated DB types in some deploys.
  // Keep it untyped to avoid build-time typecheck failures.
  const supabase = createClient(url, key) as any;

  try {
    const body = req.body as {
      token?: string;
      code?: string;
      email?: string;
      fullName: string;
      password: string;
    };

    const { token, code, email, fullName, password } = body;

    if (!fullName?.trim() || !password || password.length < 6) {
      return res.status(400).json({ error: 'Missing or invalid fields', code: 'invalid_fields' });
    }

    let invite:
      | { id: string; parent_email: string; student_id: string; used: boolean }
      | null = null;

    if (token?.trim()) {
      const trimmedToken = token.trim();
      const { data, error } = await supabase
        .from('parent_invites')
        .select('id, parent_email, student_id, used')
        .eq('token', trimmedToken)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      invite = data;
      if (!invite) {
        const { data: byCode, error: codeErr } = await supabase
          .from('parent_invites')
          .select('id, parent_email, student_id, used')
          .eq('code', trimmedToken.toUpperCase())
          .eq('used', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (codeErr) return res.status(500).json({ error: codeErr.message });
        invite = byCode;
      }
    } else if (code?.trim() && email?.trim()) {
      const normalizedCode = code.trim().toUpperCase();
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase
        .from('parent_invites')
        .select('id, parent_email, student_id, used')
        .eq('code', normalizedCode)
        .ilike('parent_email', normalizedEmail)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      invite = data;
    } else {
      return res.status(400).json({ error: 'Provide token or code and email', code: 'missing_invite' });
    }

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found', code: 'invite_not_found' });
    }
    if (invite.used) {
      return res.status(400).json({ error: 'Invite already used', code: 'invite_used' });
    }

    const normalizedEmail = invite.parent_email.trim().toLowerCase();

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (authErr) {
      const msg = authErr.message || '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        let existing: { id: string; email?: string } | undefined;
        for (let page = 1; page <= 20 && !existing; page++) {
          const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
          if (listErr || !users?.length) break;
          existing = users.find((u: any) => (u.email || '').trim().toLowerCase() === normalizedEmail);
          if (users.length < 100) break;
        }
        if (existing?.id) {
          const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.id, { password });
          if (pwErr) {
            console.warn('[register-parent] could not update password for existing user:', pwErr.message);
          }
          await linkParent(supabase, existing.id, fullName.trim(), invite.student_id, invite.id, normalizedEmail);
          return res.status(200).json({ success: true });
        }
      }
      return res.status(400).json({ error: 'Registration failed', code: 'registration_failed' });
    }

    if (!authData.user) return res.status(500).json({ error: 'User creation failed' });

    await linkParent(supabase, authData.user.id, fullName.trim(), invite.student_id, invite.id, normalizedEmail);

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[register-parent] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error', code: 'internal_error' });
  }
}

async function linkParent(
  supabase: any,
  userId: string,
  fullName: string,
  studentId: string,
  inviteId: string,
  parentEmail: string
) {
  const { data: profileRow, error: profErr } = await supabase
    .from('parent_profiles')
    .upsert(
      {
        user_id: userId,
        full_name: fullName,
        email: parentEmail,
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();

  if (profErr || !profileRow) {
    console.error('[register-parent] parent_profiles upsert failed', profErr);
    throw profErr || new Error('parent_profiles upsert failed');
  }

  const parentProfileId = profileRow.id as string;

  const { error: psErr } = await supabase.from('parent_students').upsert(
    { parent_id: parentProfileId, student_id: studentId },
    { onConflict: 'parent_id,student_id' }
  );
  if (psErr) console.error('[register-parent] parent_students upsert', psErr);

  await supabase.from('students').update({ parent_user_id: userId }).eq('id', studentId);

  await supabase.from('parent_invites').update({ used: true }).eq('id', inviteId);

  const { data: st } = await supabase
    .from('students')
    .select('linked_user_id')
    .eq('id', studentId)
    .maybeSingle();

  const linkedUid = st?.linked_user_id as string | null | undefined;
  if (linkedUid) {
    const { data: parts } = await supabase
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', linkedUid);

    const convIds = [...new Set((parts ?? []).map((p: { conversation_id: string }) => p.conversation_id))];
    for (const conversation_id of convIds) {
      await supabase.from('chat_participants').upsert(
        {
          conversation_id,
          user_id: userId,
          last_read_at: new Date().toISOString(),
          email_notify_enabled: true,
          email_notify_delay_hours: 12,
        },
        { onConflict: 'conversation_id,user_id' }
      );
    }
  }
}
