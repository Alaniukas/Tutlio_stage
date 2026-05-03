import type { SupabaseClient } from '@supabase/supabase-js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateParentInviteTokenAndCode(): { token: string; code: string } {
  const token = crypto.randomUUID();
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return { token, code };
}

export type ParentInviteSource = 'student_self' | 'school_admin';

export async function insertParentInviteAndSendEmail(opts: {
  supabase: SupabaseClient;
  appUrl: string;
  parentEmail: string;
  studentId: string;
  studentFullName: string;
  parentName?: string | null;
  source?: ParentInviteSource | null;
  invitedByUserId?: string | null;
}): Promise<{ token: string; code: string } | { error: string }> {
  const {
    supabase,
    appUrl,
    parentEmail,
    studentId,
    studentFullName,
    parentName,
    source,
    invitedByUserId,
  } = opts;

  const trimmedEmail = parentEmail.trim().toLowerCase();
  if (!trimmedEmail) return { error: 'Invalid parent email' };

  let token = '';
  let code = '';
  let insertErr: { message: string; code?: string; details?: string } | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const gen = generateParentInviteTokenAndCode();
    token = gen.token;
    code = gen.code;
    const ins = await supabase.from('parent_invites').insert({
      token,
      code,
      parent_email: trimmedEmail,
      parent_name: parentName?.trim() || null,
      student_id: studentId,
      used: false,
      source: source ?? null,
      invited_by_user_id: invitedByUserId ?? null,
    });
    insertErr = ins.error as typeof insertErr;
    if (!insertErr) break;
    const retryable =
      insertErr.code === '23505' ||
      /duplicate key|unique constraint/i.test(String(insertErr.message || ''));
    if (!retryable) {
      console.error('[insertParentInviteAndSendEmail]', insertErr);
      const detail = insertErr.details ? ` ${insertErr.details}` : '';
      return { error: `${insertErr.message || 'Insert failed'}${detail}`.trim() };
    }
  }

  if (insertErr) {
    console.error('[insertParentInviteAndSendEmail] exhausted retries', insertErr);
    return { error: insertErr.message || 'Could not create invite (unique constraint)' };
  }

  const registerLink = `${appUrl}/parent-register?token=${encodeURIComponent(token)}`;

  try {
    await fetch(`${appUrl}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: 'parent_invite',
        to: trimmedEmail,
        data: {
          parentName: parentName?.trim() || '',
          studentName: studentFullName,
          registerLink,
          token,
          code,
        },
      }),
    });
  } catch (err) {
    console.error('[insertParentInviteAndSendEmail] email error:', err);
  }

  return { token, code };
}
