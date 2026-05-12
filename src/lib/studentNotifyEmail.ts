import { supabase } from '@/lib/supabase';

/** Resolve where to send booking / session emails when `students.email` is empty but the row is linked to a user account. */
export async function resolveStudentNotificationEmail(row: {
  email?: string | null;
  linked_user_id?: string | null;
} | null | undefined): Promise<string | null> {
  if (!row) return null;
  const direct = String(row.email ?? '').trim();
  if (direct) return direct;
  const uid = row.linked_user_id;
  if (!uid || typeof uid !== 'string') return null;
  try {
    const { data: prof } = await supabase.from('profiles').select('email').eq('id', uid).maybeSingle();
    const em = String(prof?.email ?? '').trim();
    return em || null;
  } catch {
    return null;
  }
}
