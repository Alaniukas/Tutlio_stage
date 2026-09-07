/** Keep session-files listing cheap: Storage `search` is what stalled Tutlio today. */

export const SESSION_FILES_BUCKET = 'session-files';
export const SESSION_FILES_LIST_LIMIT = 50;
/** Files tab: do not walk a student's entire history (can be hundreds of folders). */
export const SESSION_FILES_TAB_MAX_FOLDERS = 40;
export const SESSION_FILES_TAB_PAST_DAYS = 30;
export const SESSION_FILES_TAB_FUTURE_DAYS = 14;

export function sessionFilesListOptions() {
  return {
    limit: SESSION_FILES_LIST_LIMIT,
    sortBy: { column: 'created_at' as const, order: 'asc' as const },
  };
}

export const STUDENT_FILES_LIVE_POLL_MS = 10_000;
export const STUDENT_FILES_IDLE_POLL_MS = 90_000;
const LIVE_BEFORE_MS = 15 * 60_000;
const LIVE_AFTER_MS = 30 * 60_000;

/** Fast refresh while the lesson is on; slow refresh if a modal is left open afterwards. */
export function studentFilesPollIntervalMs(
  now: number,
  lesson: { start: number; end: number } | null,
): number {
  if (!lesson || !Number.isFinite(lesson.start) || !Number.isFinite(lesson.end)) {
    return STUDENT_FILES_LIVE_POLL_MS;
  }
  if (now >= lesson.start - LIVE_BEFORE_MS && now <= lesson.end + LIVE_AFTER_MS) {
    return STUDENT_FILES_LIVE_POLL_MS;
  }
  return STUDENT_FILES_IDLE_POLL_MS;
}

/** Current lesson first, then siblings — UI can show something before the whole group is scanned. */
export function orderSessionFileFolders(sessionId: string, groupIds: string[]): string[] {
  const rest = groupIds.filter((id) => id && id !== sessionId);
  return sessionId ? [sessionId, ...rest] : rest;
}

export function sessionsToScanForFilesTab<T extends { start_time: string }>(
  sessions: T[],
  opts: { dateFrom?: string; dateTo?: string; now?: Date } = {},
): T[] {
  const now = opts.now ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - SESSION_FILES_TAB_PAST_DAYS);
  const defaultTo = new Date(now);
  defaultTo.setDate(defaultTo.getDate() + SESSION_FILES_TAB_FUTURE_DAYS);
  const from = opts.dateFrom || ymd(defaultFrom);
  const to = opts.dateTo || ymd(defaultTo);
  return [...sessions]
    .filter((s) => {
      const d = ymd(new Date(s.start_time));
      return d >= from && d <= to;
    })
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .slice(0, SESSION_FILES_TAB_MAX_FOLDERS);
}
