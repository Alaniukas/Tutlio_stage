import type { SupabaseClient } from '@supabase/supabase-js';

export function validAcceptanceDeliveryKey(type: string, jobId: unknown, key: unknown) {
  const kind = type === 'school_contract_extra_accepted' ? 'confirmation' : type === 'school_extra_first_lesson_invite' ? 'invite' : null;
  return kind && typeof jobId === 'string' && /^[0-9a-f-]{36}$/i.test(jobId)
    && key === `school-acceptance/${jobId}/${kind}`;
}
/** Freeze provider payload; identical key AND payload on retries, including invitation dates/links. */
export async function deliverAcceptanceOnce(params: {
  db: SupabaseClient; jobId: string; organizationId: string; key: string; payload: any;
  send: (payload: any, key: string) => Promise<{ id?: string; error?: string }>;
}) {
  const { db, key } = params;
  const job = await db.from('school_acceptance_jobs').select('id,finalized_at').eq('id', params.jobId)
    .eq('organization_id', params.organizationId).maybeSingle();
  if (job.error || !job.data?.finalized_at) return { error: 'Acceptance is not finalized' };
  const load = () => db.from('school_acceptance_deliveries').select('*').eq('id', key).maybeSingle();
  let { data: row, error } = await load();
  if (error) return { error: 'Delivery state unavailable' };
  if (!row) {
    const inserted = await db.from('school_acceptance_deliveries').insert({ id: key, job_id: params.jobId,
      payload: params.payload }).select('*').single();
    if (inserted.error?.code === '23505') ({ data: row, error } = await load());
    else ({ data: row, error } = inserted);
    if (error || !row) return { error: 'Delivery reservation failed' };
  }
  if (row.sent_at) return { id: row.provider_message_id, alreadySent: true };
  // Resend deduplicates for 24h. Do not blindly duplicate an uncertain delivery after that window.
  const age = Date.now() - Date.parse(row.attempted_at);
  if (!Number.isFinite(age) || age < 0 || age >= 23 * 3600000) return { error: 'Delivery outcome requires review' };
  const result = await params.send(row.payload, key);
  if (result.error || !result.id) return { error: result.error || 'Provider did not confirm delivery' };
  const saved = await db.from('school_acceptance_deliveries').update({ sent_at: new Date().toISOString(), provider_message_id: result.id }).eq('id', key);
  if (saved.error) return { error: 'Provider accepted; delivery state save failed' };
  return { id: result.id };
}
