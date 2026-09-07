import { describe, expect, it } from 'vitest';
import {
  parseOrgTrialPolicy,
  shouldAutoMarkNextLessonTrial,
  trialCommentRequiredForIndex,
  countTrialsFromHistory,
  sessionNeedsOrgTrialComment,
  trialIndexAmongStudentTrials,
} from '../../src/lib/orgTrialPolicy';

describe('orgTrialPolicy', () => {
  it('defaults to one trial and comment on the first', () => {
    expect(parseOrgTrialPolicy({})).toEqual({
      commentRequired: false,
      lessonsPerStudent: 1,
      commentAfterCount: 1,
    });
  });

  it('supports two trials with a comment only after the second', () => {
    const policy = parseOrgTrialPolicy({
      trial_comment_required: true,
      trial_lessons_per_student: 2,
      trial_comment_after_count: 2,
    });
    expect(policy).toEqual({
      commentRequired: true,
      lessonsPerStudent: 2,
      commentAfterCount: 2,
    });
    expect(trialCommentRequiredForIndex(1, policy)).toBe(false);
    expect(trialCommentRequiredForIndex(2, policy)).toBe(true);
  });

  it('auto-marks a second trial only when the student has no regular lessons yet', () => {
    const policy = { lessonsPerStudent: 2 };
    expect(shouldAutoMarkNextLessonTrial({ trialCount: 0, regularCount: 0, policy })).toBe(true);
    expect(shouldAutoMarkNextLessonTrial({ trialCount: 1, regularCount: 0, policy })).toBe(true);
    expect(shouldAutoMarkNextLessonTrial({ trialCount: 2, regularCount: 0, policy })).toBe(false);
    expect(shouldAutoMarkNextLessonTrial({ trialCount: 1, regularCount: 1, policy })).toBe(false);
    expect(shouldAutoMarkNextLessonTrial({ trialCount: 0, regularCount: 0, policy, enabled: false })).toBe(false);
  });

  it('ignores cancelled trials when numbering comments', () => {
    const policy = parseOrgTrialPolicy({
      trial_comment_required: true,
      trial_lessons_per_student: 2,
      trial_comment_after_count: 2,
    });
    const rows = [
      { id: 'a', start_time: '2026-09-01', status: 'cancelled' },
      { id: 'b', start_time: '2026-09-08', status: 'completed' },
    ];
    expect(sessionNeedsOrgTrialComment({ policy, isTrial: true, sessionId: 'b', studentTrials: rows })).toBe(false);
  });

  it('requires a comment on the second non-cancelled trial', () => {
    const policy = parseOrgTrialPolicy({
      trial_comment_required: true,
      trial_lessons_per_student: 2,
      trial_comment_after_count: 2,
    });
    const rows = [
      { id: 'a', start_time: '2026-09-01', status: 'completed' },
      { id: 'b', start_time: '2026-09-08', status: 'completed' },
    ];
    expect(sessionNeedsOrgTrialComment({ policy, isTrial: true, sessionId: 'a', studentTrials: rows })).toBe(false);
    expect(sessionNeedsOrgTrialComment({ policy, isTrial: true, sessionId: 'b', studentTrials: rows })).toBe(true);
  });

  it('counts non-cancelled trials vs regular lessons', () => {
    expect(
      countTrialsFromHistory([
        { status: 'completed', subjects: { is_trial: true } },
        { status: 'cancelled', subjects: { is_trial: true } },
        { status: 'active', subjects: { is_trial: false } },
      ]),
    ).toEqual({ trialCount: 1, regularCount: 1 });
  });

  it('numbers trials oldest first', () => {
    const rows = [
      { id: 'a', start_time: '2026-09-01' },
      { id: 'b', start_time: '2026-09-08' },
    ];
    expect(trialIndexAmongStudentTrials('b', rows)).toBe(2);
    expect(trialIndexAmongStudentTrials('missing', rows)).toBe(0);
  });
});
