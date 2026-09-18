export type StudentPaymentLessonOrderRow = {
  id?: string;
  start_time: string;
  subject?: { is_trial?: boolean | null } | null;
};

function lessonTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

/**
 * Orders unpaid lessons for the student payments page: trial lessons first,
 * then the closest lesson before later lessons.
 */
export function orderStudentPaymentLessons<T extends StudentPaymentLessonOrderRow>(lessons: T[]): T[] {
  return [...lessons].sort((left, right) => {
    const trialPriority = Number(right.subject?.is_trial === true) - Number(left.subject?.is_trial === true);
    if (trialPriority !== 0) return trialPriority;

    const timeOrder = lessonTimestamp(left.start_time) - lessonTimestamp(right.start_time);
    if (timeOrder !== 0) return timeOrder;

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}
