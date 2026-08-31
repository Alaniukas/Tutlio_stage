import { addWeeks, format, getDay } from 'date-fns';

/** Ongoing Pro Klasė lessons after a trial are 60 minutes. */
export const CONTINUE_LEARNING_DURATION_MINUTES = 60;

export function continueLearningFirstOccurrence(trialStart: Date): Date {
  return addWeeks(trialStart, 1);
}

export function continueLearningEndFromStart(start: Date): Date {
  return new Date(start.getTime() + CONTINUE_LEARNING_DURATION_MINUTES * 60 * 1000);
}

export function continueLearningDayOfWeek(trialStart: Date): number {
  return getDay(trialStart);
}

export function continueLearningClockTime(trialStart: Date): string {
  return format(trialStart, 'HH:mm:ss');
}

export function continueLearningEndClockTime(start: Date): string {
  return format(continueLearningEndFromStart(start), 'HH:mm:ss');
}
