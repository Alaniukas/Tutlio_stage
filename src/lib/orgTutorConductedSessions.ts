/**
 * Shared "conducted lesson" rules for company org admin stats and tutor cards.
 * A lesson counts when it has ended with completed or student no-show status.
 */
export function isConductedOrgSession(status: string): boolean {
  return status === 'completed' || status === 'no_show';
}

export function filterConductedOrgSessions<T extends { status?: string | null }>(
  sessions: T[],
): T[] {
  return sessions.filter((s) => isConductedOrgSession(String(s.status || '')));
}

export function countConductedOrgSessions(sessions: Array<{ status?: string | null }>): number {
  return filterConductedOrgSessions(sessions).length;
}
