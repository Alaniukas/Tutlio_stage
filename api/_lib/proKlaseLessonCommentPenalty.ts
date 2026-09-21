/** Pro Klasė: trial-comment penalty/reminder eligibility (cron + UI). */

import {
  sessionNeedsOrgTrialComment,
  type OrgTrialPolicy,
} from '../../src/lib/orgTrialPolicy.js';

export type ProKlaseTrialHistorySession = {
  id: string;
  student_id: string;
  start_time?: string | null;
  status?: string | null;
};

export type ProKlaseCommentPenaltySession = {
  id: string;
  student_id: string | null;
  status: string;
  end_time?: string | null;
  tutor_comment?: string | null;
  status_confirmed_at?: string | null;
  subjects?: { is_trial?: boolean | null } | Array<{ is_trial?: boolean | null }> | null;
};

export function groupProKlaseTrialHistoryByStudent(
  rows: ProKlaseTrialHistorySession[],
): Map<string, ProKlaseTrialHistorySession[]> {
  const byStudent = new Map<string, ProKlaseTrialHistorySession[]>();
  for (const row of rows) {
    const trials = byStudent.get(row.student_id) ?? [];
    trials.push(row);
    byStudent.set(row.student_id, trials);
  }
  return byStudent;
}

export function proKlaseSessionHasTutorComment(
  session: Pick<ProKlaseCommentPenaltySession, 'tutor_comment'>,
): boolean {
  return Boolean(session.tutor_comment?.trim());
}

export function proKlaseSessionRequiresTrialComment(
  session: ProKlaseCommentPenaltySession,
  policy: OrgTrialPolicy,
  studentTrials: ProKlaseTrialHistorySession[],
): boolean {
  const subject = Array.isArray(session.subjects) ? session.subjects[0] : session.subjects;
  return sessionNeedsOrgTrialComment({
    policy,
    isTrial: subject?.is_trial === true,
    sessionId: session.id,
    studentTrials,
  });
}

export function proKlaseSessionMissingComment(
  session: ProKlaseCommentPenaltySession,
): boolean {
  return ['completed', 'no_show'].includes(session.status)
    && Boolean(session.status_confirmed_at)
    && !proKlaseSessionHasTutorComment(session);
}

export function proKlaseSessionEligibleForTrialCommentPenalty(
  session: ProKlaseCommentPenaltySession,
  policy: OrgTrialPolicy,
  studentTrials: ProKlaseTrialHistorySession[],
  nowMs = Date.now(),
): boolean {
  if (!proKlaseSessionRequiresTrialComment(session, policy, studentTrials)
    || !proKlaseSessionMissingComment(session)) return false;
  const confirmedMs = Date.parse(session.status_confirmed_at || '');
  return Number.isFinite(confirmedMs) && confirmedMs <= nowMs - 48 * 60 * 60 * 1000;
}

export function proKlaseSessionEligibleForTrialCommentReminder(
  session: ProKlaseCommentPenaltySession,
  policy: OrgTrialPolicy,
  studentTrials: ProKlaseTrialHistorySession[],
  nowMs = Date.now(),
): boolean {
  if (!proKlaseSessionRequiresTrialComment(session, policy, studentTrials)
    || !proKlaseSessionMissingComment(session)) return false;
  const confirmedMs = Date.parse(session.status_confirmed_at || '');
  return Number.isFinite(confirmedMs)
    && confirmedMs <= nowMs - 24 * 60 * 60 * 1000
    && confirmedMs > nowMs - 48 * 60 * 60 * 1000;
}
