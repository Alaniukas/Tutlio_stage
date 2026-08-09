import type { SupabaseClient } from '@supabase/supabase-js';

export function normalizeReminderEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

/** Returns the set of opted-out emails (lowercased) from the given candidates. */
export async function loadReminderOptOuts(
  supabase: SupabaseClient,
  emails: Iterable<string | null | undefined>,
): Promise<Set<string>> {
  const norms = [...new Set([...emails].map(normalizeReminderEmail).filter(Boolean))];
  if (norms.length === 0) return new Set();

  const { data, error } = await supabase
    .from('email_reminder_opt_outs')
    .select('email')
    .in('email', norms);

  if (error) {
    console.error('[reminderOptOut] load failed:', error.message);
    return new Set();
  }

  return new Set((data || []).map((r) => normalizeReminderEmail(r.email)));
}

export async function isReminderOptedOut(
  supabase: SupabaseClient,
  email: string | null | undefined,
): Promise<boolean> {
  const norm = normalizeReminderEmail(email);
  if (!norm) return false;
  const set = await loadReminderOptOuts(supabase, [norm]);
  return set.has(norm);
}

export async function upsertReminderOptOut(
  supabase: SupabaseClient,
  email: string,
  source: string = 'footer_page',
): Promise<{ email: string }> {
  const norm = normalizeReminderEmail(email);
  if (!norm || !norm.includes('@')) {
    throw new Error('Invalid email');
  }

  const { error } = await supabase.from('email_reminder_opt_outs').upsert(
    { email: norm, opted_out_at: new Date().toISOString(), source },
    { onConflict: 'email' },
  );
  if (error) throw new Error(error.message);

  // Best-effort sync with registered parent settings (table opt-out is source of truth).
  const { error: profileErr } = await supabase
    .from('parent_profiles')
    .update({ disable_lesson_reminders: true })
    .eq('email', norm);
  if (profileErr) {
    console.warn('[reminderOptOut] parent_profiles sync skipped:', profileErr.message);
  }

  return { email: norm };
}
