import { describe, expect, it } from 'vitest';
import { parseOrgTrialPolicy } from '../../src/lib/orgTrialPolicy';
import {
  groupProKlaseTrialHistoryByStudent,
  proKlaseSessionEligibleForTrialCommentPenalty,
  proKlaseSessionEligibleForTrialCommentReminder,
  proKlaseSessionHasTutorComment,
  proKlaseSessionRequiresTrialComment,
  type ProKlaseCommentPenaltySession,
  type ProKlaseTrialHistorySession,
} from '../../api/_lib/proKlaseLessonCommentPenalty';

const now = Date.parse('2026-09-17T12:00:00.000Z');
const policy = parseOrgTrialPolicy({ trial_comment_required: true, trial_comment_after_count: 1 });
const trialHistory: ProKlaseTrialHistorySession[] = [
  { id: 'trial-1', student_id: 'student-1', start_time: '2026-09-06T15:00:00.000Z', status: 'completed' },
];
const trial: ProKlaseCommentPenaltySession = {
  id: 'trial-1',
  student_id: 'student-1',
  status: 'completed',
  end_time: '2026-09-06T16:00:00.000Z',
  tutor_comment: null,
  status_confirmed_at: '2026-09-14T11:00:00.000Z',
  subjects: { is_trial: true },
};

describe('Pro Klasė trial comment penalties', () => {
  it('does not penalize or remind for regular lessons, even after 48 hours', () => {
    const regular = { ...trial, subjects: { is_trial: false } };
    expect(proKlaseSessionEligibleForTrialCommentPenalty(regular, policy, trialHistory, now)).toBe(false);
    expect(proKlaseSessionEligibleForTrialCommentReminder(regular, policy, trialHistory, now)).toBe(false);
  });

  it('waits 48 hours from confirmation even when the lesson ended much earlier', () => {
    const confirmed21HoursAgo = { ...trial, status_confirmed_at: '2026-09-16T15:00:00.000Z' };
    expect(proKlaseSessionEligibleForTrialCommentPenalty(confirmed21HoursAgo, policy, trialHistory, now)).toBe(false);
    expect(proKlaseSessionEligibleForTrialCommentReminder(confirmed21HoursAgo, policy, trialHistory, now)).toBe(false);
  });

  it('penalizes a required trial after 48 hours from confirmation', () => {
    expect(proKlaseSessionEligibleForTrialCommentPenalty(trial, policy, trialHistory, now)).toBe(true);
    expect(proKlaseSessionEligibleForTrialCommentReminder(trial, policy, trialHistory, now)).toBe(false);
  });

  it('reminds from 24 to 48 hours after confirmation', () => {
    const confirmed30HoursAgo = { ...trial, status_confirmed_at: '2026-09-16T06:00:00.000Z' };
    expect(proKlaseSessionEligibleForTrialCommentReminder(confirmed30HoursAgo, policy, trialHistory, now)).toBe(true);
    expect(proKlaseSessionEligibleForTrialCommentPenalty(confirmed30HoursAgo, policy, trialHistory, now)).toBe(false);
  });

  it('requires a confirmation and a genuinely missing comment', () => {
    expect(proKlaseSessionEligibleForTrialCommentPenalty({ ...trial, status_confirmed_at: null }, policy, trialHistory, now)).toBe(false);
    expect(proKlaseSessionHasTutorComment({ tutor_comment: '  ' })).toBe(false);
    expect(proKlaseSessionEligibleForTrialCommentPenalty({ ...trial, tutor_comment: '  Report  ' }, policy, trialHistory, now)).toBe(false);
  });

  it('respects the configured trial number and groups history by student', () => {
    const secondTrial = { id: 'trial-2', student_id: 'student-1', start_time: '2026-09-07T15:00:00.000Z', status: 'completed' };
    const historyByStudent = groupProKlaseTrialHistoryByStudent([...trialHistory, secondTrial]);
    const secondOnlyPolicy = parseOrgTrialPolicy({
      trial_comment_required: true,
      trial_lessons_per_student: 2,
      trial_comment_after_count: 2,
    });
    expect(proKlaseSessionRequiresTrialComment(trial, secondOnlyPolicy, historyByStudent.get('student-1') || [])).toBe(false);
    expect(proKlaseSessionEligibleForTrialCommentPenalty(
      { ...trial, id: 'trial-2' }, secondOnlyPolicy, historyByStudent.get('student-1') || [], now,
    )).toBe(true);
    expect(proKlaseSessionEligibleForTrialCommentPenalty(trial, parseOrgTrialPolicy({}), trialHistory, now)).toBe(false);
  });
});
