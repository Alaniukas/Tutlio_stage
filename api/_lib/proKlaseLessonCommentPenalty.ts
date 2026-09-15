/** Pro Klasė: missing-comment penalty/reminder eligibility (cron + UI). */

export type ProKlaseCommentPenaltySession = {
  status: string;
  end_time: string;
  tutor_comment?: string | null;
  status_confirmed_at?: string | null;
};

export function proKlaseSessionMissingComment(
  session: ProKlaseCommentPenaltySession,
): boolean {
  if (!['completed', 'no_show'].includes(String(session.status))) return false;
  if (!session.status_confirmed_at) return false;
  return !String(session.tutor_comment || '').trim();
}

export function proKlaseSessionEligibleForMissingCommentPenalty(
  session: ProKlaseCommentPenaltySession,
  nowMs = Date.now(),
): boolean {
  if (!proKlaseSessionMissingComment(session)) return false;
  const endMs = Date.parse(String(session.end_time));
  const penaltyCutoffMs = nowMs - 48 * 60 * 60 * 1000;
  return Number.isFinite(endMs) && endMs <= penaltyCutoffMs;
}

export function proKlaseSessionEligibleForMissingCommentReminder(
  session: ProKlaseCommentPenaltySession,
  nowMs = Date.now(),
): boolean {
  if (!proKlaseSessionMissingComment(session)) return false;
  const endMs = Date.parse(String(session.end_time));
  const reminderCutoffMs = nowMs - 24 * 60 * 60 * 1000;
  const penaltyCutoffMs = nowMs - 48 * 60 * 60 * 1000;
  return Number.isFinite(endMs) && endMs <= reminderCutoffMs && endMs > penaltyCutoffMs;
}
