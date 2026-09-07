// Parent/payer reminder recipient resolution (Pro Klase intake funnel, req 7).
//
// With the `flexible_invitations` feature on, a lesson reminder goes to every
// parent contact (payer + secondary + registered parents) alongside the
// student. This helper keeps the merge rules — dedup, drop the student's own
// address, drop opt-outs — in one tested place.

export type ReminderRecipient = { email: string; name: string | null };

/**
 * Dedupe a list of candidate parent recipients (case-insensitive by email),
 * removing the student's own email and any opted-out addresses. Order of first
 * occurrence is preserved.
 */
export function dedupeReminderRecipients(
  candidates: ReminderRecipient[],
  opts: { studentEmail?: string | null; optedOutEmails?: Iterable<string> } = {},
): ReminderRecipient[] {
  const studentNorm = (opts.studentEmail || '').trim().toLowerCase();
  const optedOut = new Set<string>();
  for (const e of opts.optedOutEmails ?? []) optedOut.add(String(e).trim().toLowerCase());

  const seen = new Set<string>();
  const out: ReminderRecipient[] = [];
  for (const c of candidates) {
    const norm = (c.email || '').trim().toLowerCase();
    if (!norm || norm === studentNorm) continue;
    if (optedOut.has(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ email: c.email.trim(), name: c.name ?? null });
  }
  return out;
}
