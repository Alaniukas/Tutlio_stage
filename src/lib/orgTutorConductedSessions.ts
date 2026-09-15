/**
 * Shared "conducted lesson" rules for company org admin stats and tutor cards.
 * A lesson counts when it has ended with completed or student no-show status.
 */
export function isConductedOrgSession(status: string): boolean {
  return status === 'completed' || status === 'no_show';
}

export function filterConductedOrgSessions<T extends {
  status?: string | null;
  exclude_from_lesson_count?: boolean | null;
}>(
  sessions: T[],
): T[] {
  return sessions.filter((s) => isConductedOrgSession(String(s.status || '')));
}

export function countConductedOrgSessions(sessions: Array<{
  status?: string | null;
  exclude_from_lesson_count?: boolean | null;
}>): number {
  return sessions.filter(
    (s) => s.exclude_from_lesson_count !== true && isConductedOrgSession(String(s.status || '')),
  ).length;
}
