/** Org trial-lesson counts and when a tutor comment is required. */

export type OrgTrialPolicy = {
  commentRequired: boolean;
  /** How many trial lessons a student may take (1–5). */
  lessonsPerStudent: number;
  /** Require a comment from this trial number onward (1 = first, 2 = second). */
  commentAfterCount: number;
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseOrgTrialPolicy(features: Record<string, unknown> | null | undefined): OrgTrialPolicy {
  const commentRequired = features?.['trial_comment_required'] === true;
  const lessonsPerStudent = clampInt(features?.['trial_lessons_per_student'], 1, 5, 1);
  const commentAfterCount = Math.min(
    lessonsPerStudent,
    clampInt(features?.['trial_comment_after_count'], 1, 5, 1),
  );
  return { commentRequired, lessonsPerStudent, commentAfterCount };
}

/** Auto-trial the next booking while the student still only has trials, under the org cap. */
export function shouldAutoMarkNextLessonTrial(opts: {
  trialCount: number;
  regularCount: number;
  policy: Pick<OrgTrialPolicy, 'lessonsPerStudent'>;
  /** When false (Mokslo vaisiai tutors mark trials themselves), never auto-check. */
  enabled?: boolean;
}): boolean {
  if (opts.enabled === false) return false;
  return opts.regularCount === 0 && opts.trialCount < opts.policy.lessonsPerStudent;
}

/** `trialIndex1Based` is this session’s place among the student’s trials, oldest first. */
export function trialCommentRequiredForIndex(
  trialIndex1Based: number,
  policy: OrgTrialPolicy,
): boolean {
  if (!policy.commentRequired) return false;
  return trialIndex1Based >= policy.commentAfterCount;
}

export function sortTrialsOldestFirst<T extends { start_time?: string | Date | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = a.start_time ? new Date(a.start_time as string).getTime() : 0;
    const tb = b.start_time ? new Date(b.start_time as string).getTime() : 0;
    return ta - tb;
  });
}

export function trialIndexAmongStudentTrials<T extends { id: string; start_time?: string | Date | null }>(
  sessionId: string,
  studentTrialsOldestFirst: T[],
): number {
  const idx = studentTrialsOldestFirst.findIndex((row) => row.id === sessionId);
  return idx < 0 ? 0 : idx + 1;
}

export function countableNonCancelled<T extends { status?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.status !== 'cancelled');
}

export function sessionNeedsOrgTrialComment(opts: {
  policy: OrgTrialPolicy;
  isTrial: boolean;
  sessionId: string;
  studentTrials: Array<{ id: string; start_time?: string | Date | null; status?: string | null }>;
}): boolean {
  if (!opts.isTrial || !opts.policy.commentRequired) return false;
  const ordered = sortTrialsOldestFirst(countableNonCancelled(opts.studentTrials));
  const idx = trialIndexAmongStudentTrials(opts.sessionId, ordered);
  return trialCommentRequiredForIndex(idx, opts.policy);
}

export function countTrialsFromHistory(
  rows: Array<{
    status?: string | null;
    subjects?: { is_trial?: boolean | null } | Array<{ is_trial?: boolean | null }> | null;
  }>,
): { trialCount: number; regularCount: number } {
  const counted = countableNonCancelled(rows);
  const trialCount = counted.filter((row) => {
    const subj = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    return subj?.is_trial === true;
  }).length;
  return { trialCount, regularCount: counted.length - trialCount };
}
