import { describe, expect, it } from 'vitest';
import {
  CONTINUE_LEARNING_DURATION_MINUTES,
  continueLearningClockTime,
  continueLearningDayOfWeek,
  continueLearningEndFromStart,
  continueLearningFirstOccurrence,
} from '../../src/lib/continueTrialLearning';

describe('continueTrialLearning', () => {
  it('starts the weekly series one week after the trial, 60 minutes long', () => {
    const trial = new Date('2026-09-01T14:00:00');
    const first = continueLearningFirstOccurrence(trial);
    expect(first.toISOString()).toBe(new Date('2026-09-08T14:00:00').toISOString());
    expect(continueLearningDayOfWeek(trial)).toBe(trial.getDay());
    expect(continueLearningClockTime(trial)).toBe('14:00:00');
    const end = continueLearningEndFromStart(first);
    expect((end.getTime() - first.getTime()) / 60000).toBe(CONTINUE_LEARNING_DURATION_MINUTES);
  });

  it('keeps the same weekday and clock time as the trial', () => {
    const trial = new Date(2026, 8, 1, 17, 0, 0); // Tuesday 17:00 local
    expect(continueLearningDayOfWeek(trial)).toBe(2);
    expect(continueLearningClockTime(trial)).toBe('17:00:00');
    const first = continueLearningFirstOccurrence(trial);
    expect(first.getDay()).toBe(2);
    expect(first.getHours()).toBe(17);
    expect(first.getDate()).toBe(8);
  });
});
