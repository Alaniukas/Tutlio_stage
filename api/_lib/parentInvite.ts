import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPublicAppUrl } from './public-origin.js';
import { sendParentInviteEmail } from './sendParentInviteEmail.js';

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

export type ParentInviteResult =
  | { token: string; code: string; emailSent: boolean; emailError?: string }
  | { error: string };

export async function insertParentInviteAndSendEmail(opts: {
  supabase: SupabaseClient;
  appUrl: string;
  parentEmail: string;
  studentId: string;
  studentFullName: string;
  parentName?: string | null;
  source?: ParentInviteSource | null;
  invitedByUserId?: string | null;
  /** Email copy language (any supported locale). */
  locale?: string;
  /** UI locale for URL path prefix (lt, en, pl, …). Falls back to `locale`. */
  uiLocale?: string;
}): Promise<ParentInviteResult> {
  const {
    supabase,
    appUrl,
    parentEmail,
    studentId,
    studentFullName,
    parentName,
    source,
    invitedByUserId,
    locale,
    uiLocale,
  } = opts;

  const trimmedEmail = parentEmail.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return { error: 'Invalid parent email' };
  }

  const origin = (appUrl || 'https://tutlio.lt').replace(/\/$/, '');

  let token = '';
  let code = '';

  const { data: existingInvite, error: existingErr } = await supabase
    .from('parent_invites')
    .select('token, code')
    .eq('student_id', studentId)
    .ilike('parent_email', trimmedEmail)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    console.warn('[insertParentInviteAndSendEmail] existing invite lookup:', existingErr.message);
  }

  if (existingInvite?.token && existingInvite?.code) {
    token = String(existingInvite.token);
    code = String(existingInvite.code);
  } else {
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
        console.error('[insertParentInviteAndSendEmail] insert failed', insertErr);
        const detail = insertErr.details ? ` ${insertErr.details}` : '';
        return { error: `${insertErr.message || 'Insert failed'}${detail}`.trim() };
      }
    }

    if (insertErr) {
      console.error('[insertParentInviteAndSendEmail] exhausted retries', insertErr);
      return { error: insertErr.message || 'Could not create invite (unique constraint)' };
    }
  }

  const registerLink = buildPublicAppUrl(origin, '/parent-register', {
    locale: uiLocale || locale,
    searchParams: { token },
  });

  const emailResult = await sendParentInviteEmail(trimmedEmail, {
    parentName: parentName?.trim() || null,
    studentName: studentFullName,
    registerLink,
    code,
    locale,
    publicHost: origin,
  });

  if (!emailResult.ok) {
    return {
      token,
      code,
      emailSent: false,
      emailError: emailResult.error,
    };
  }

  return { token, code, emailSent: true };
}
