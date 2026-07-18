/**
 * Student preferred availability (students.preferred_availability JSONB):
 * weekly windows the org admin marked as suitable for the student. Used to
 * prefill the free-time tutor search filters.
 */

export interface StudentPreferredWindow {
  /** JS getDay(): 0=Sunday..6=Saturday. */
  day_of_week: number;
  /** 'HH:MM' 24h. */
  start_time: string;
  /** 'HH:MM' 24h, must be after start_time. */
  end_time: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates raw JSONB into a clean window list; garbage in → []. */
export function parsePreferredAvailability(raw: unknown): StudentPreferredWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: StudentPreferredWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const day = (item as Record<string, unknown>).day_of_week;
    const start = (item as Record<string, unknown>).start_time;
    const end = (item as Record<string, unknown>).end_time;
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) continue;
    if (typeof start !== 'string' || !TIME_RE.test(start)) continue;
    if (typeof end !== 'string' || !TIME_RE.test(end)) continue;
    if (start >= end) continue;
    out.push({ day_of_week: day, start_time: start, end_time: end });
  }
  return out.sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}

/**
 * A student identity spans several duplicate rows (one per tutor pairing);
 * availability is kept in sync across them, but reads must tolerate drift —
 * take the first row that actually has windows.
 */
export function pickGroupPreferredAvailability(
  rows: Array<{ preferred_availability?: unknown }>,
): StudentPreferredWindow[] {
  for (const row of rows) {
    const parsed = parsePreferredAvailability(row?.preferred_availability);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

/** FindTutorModal's initialPreferredWindows prop shape. */
export function toFindTutorWindows(
  windows: StudentPreferredWindow[],
): Array<{ dayOfWeek: number; startTime: string; endTime: string }> {
  return windows.map((window) => ({
    dayOfWeek: window.day_of_week,
    startTime: window.start_time,
    endTime: window.end_time,
  }));
}
