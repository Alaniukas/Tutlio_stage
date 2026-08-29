const DAY_MS = 86_400_000;

/**
 * Conservative cumulative estimate for the public landing page.
 *
 * The live sessions table cannot represent an all-time total because lesson
 * deletion is destructive and open-ended recurring schedules are only
 * materialized for a rolling window. This stable date-based progression keeps
 * the displayed cumulative baseline independent of visitor state or storage.
 */
export const LANDING_LESSON_ESTIMATE_BASE = 1_800;
export const LANDING_LESSON_ESTIMATE_ANCHOR_UTC = Date.UTC(2026, 7, 29);

function utcDayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/** Stable, random-looking daily increment in the inclusive 10–30 range. */
export function landingLessonDailyIncrement(dayAfterAnchor: number): number {
  const normalizedDay = Math.max(1, Math.floor(dayAfterAnchor));
  // 17 and 21 are coprime, so all 21 values appear in a shuffled order before
  // the sequence repeats, and two consecutive days never receive the same one.
  return 10 + ((normalizedDay * 17 + 5) % 21);
}

export function estimatedLandingLessonCount(at: Date = new Date()): number {
  const elapsedDays = Math.max(
    0,
    Math.floor((utcDayStart(at) - LANDING_LESSON_ESTIMATE_ANCHOR_UTC) / DAY_MS),
  );

  let estimate = LANDING_LESSON_ESTIMATE_BASE;
  for (let day = 1; day <= elapsedDays; day += 1) {
    estimate += landingLessonDailyIncrement(day);
  }
  return estimate;
}

/** Never hide a higher live total if genuine stored lessons overtake the estimate. */
export function publicLandingLessonCount(liveCount: number, at: Date = new Date()): number {
  const safeLiveCount = Number.isFinite(liveCount) ? Math.max(0, Math.floor(liveCount)) : 0;
  return Math.max(safeLiveCount, estimatedLandingLessonCount(at));
}
