/** Hide cancelled rows when another session already occupies the same start time. */
export function filterCalendarGridSessions<T extends { status: string; start_time: Date | string }>(
  sessions: T[],
): T[] {
  const occupiedStarts = new Set(
    sessions
      .filter((session) => session.status !== 'cancelled')
      .map((session) => new Date(session.start_time).getTime()),
  );
  return sessions.filter((session) => {
    if (session.status !== 'cancelled') return true;
    return !occupiedStarts.has(new Date(session.start_time).getTime());
  });
}
