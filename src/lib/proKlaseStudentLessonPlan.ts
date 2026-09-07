/**
 * When planning multiple lesson slots for a new student, at most one may be a trial.
 * Default: all full-price unless firstLessonIsTrial is explicitly true.
 */
export function markFirstChronologicalLessonAsTrial<T extends { lessonStartIso: string }>(
  items: T[],
  firstLessonIsTrial: boolean,
): Array<T & { isTrial: boolean }> {
  if (!firstLessonIsTrial || items.length === 0) {
    return items.map((item) => ({ ...item, isTrial: false }));
  }
  let earliestIdx = 0;
  let earliestMs = Number.POSITIVE_INFINITY;
  items.forEach((item, idx) => {
    const ms = new Date(item.lessonStartIso).getTime();
    if (Number.isFinite(ms) && ms < earliestMs) {
      earliestMs = ms;
      earliestIdx = idx;
    }
  });
  return items.map((item, idx) => ({ ...item, isTrial: idx === earliestIdx }));
}

export type PlannedStudentLessonSummary = {
  totalLessons: number;
  trialLessons: number;
  regularLessons: number;
};

export function summarizePlannedStudentLessons(
  items: Array<{ isTrial: boolean }>,
): PlannedStudentLessonSummary {
  const trialLessons = items.filter((i) => i.isTrial).length;
  return {
    totalLessons: items.length,
    trialLessons,
    regularLessons: items.length - trialLessons,
  };
}
