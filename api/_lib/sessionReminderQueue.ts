/** One school class-group slot (tutor + group + start instant). */
export function payerGroupOccurrenceKey(session: {
  id?: string;
  tutor_id?: string | null;
  class_group_id?: string | null;
  start_time?: string;
  tutor?: { id?: string | null } | null;
}): string | null {
  if (!session.class_group_id || !session.start_time) return null;
  const tutorId = String(session.tutor_id || session.tutor?.id || '').trim();
  if (!tutorId) return null;
  return `payer-group:${tutorId}:${session.class_group_id}:${new Date(session.start_time).toISOString()}`;
}

/** Keep every student row for the same group slot adjacent in the cron batch. */
export function sortSessionsForReminderDelivery<
  T extends {
    start_time: string;
    id: string;
    class_group_id?: string | null;
    tutor_id?: string | null;
    tutor?: { id?: string | null } | null;
  },
>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const startDiff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    if (startDiff !== 0) return startDiff;
    const keyA = payerGroupOccurrenceKey(a) ?? `solo:${a.id}`;
    const keyB = payerGroupOccurrenceKey(b) ?? `solo:${b.id}`;
    if (keyA !== keyB) return keyA.localeCompare(keyB);
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Finish an in-progress school group occurrence even after the soft email cap. */
export function canSendAnotherReminderEmail(
  emailAttempts: number,
  limit: number,
  burstAllowance: number,
  activeOccurrence: string | null,
  currentOccurrence: string | null,
): boolean {
  if (emailAttempts < limit) return true;
  if (!activeOccurrence || activeOccurrence !== currentOccurrence) return false;
  return emailAttempts < limit + burstAllowance;
}
