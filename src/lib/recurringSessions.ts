import { addWeeks, addMonths, parseISO, isBefore } from 'date-fns';

/**
 * Open-ended schedules keep only a small rolling calendar window materialized.
 * A daily server job extends that window, so admins never create hundreds of
 * session rows and never need to recreate the schedule manually each month.
 */
export const RECURRING_OPEN_END_HORIZON_WEEKS = 6;

export function recurringMaterializeEndDate(
  recurringEndDate: string | null | undefined,
  seriesStart: Date,
): Date {
  const trimmed = (recurringEndDate || '').trim();
  if (trimmed) {
    return parseISO(trimmed);
  }
  return addWeeks(seriesStart, RECURRING_OPEN_END_HORIZON_WEEKS);
}

export function isRecurringEndDateOpen(recurringEndDate: string | null | undefined): boolean {
  return !(recurringEndDate || '').trim();
}

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';

export function advanceRecurringOccurrence(
  current: Date,
  frequency: RecurringFrequency,
): Date {
  switch (frequency) {
    case 'biweekly':
      return addWeeks(current, 2);
    case 'monthly':
      return addMonths(current, 1);
    default:
      return addWeeks(current, 1);
  }
}

export function iterateRecurringOccurrences(
  firstOccurrence: Date,
  endLimit: Date,
  frequency: RecurringFrequency,
): Date[] {
  const out: Date[] = [];
  let current = new Date(firstOccurrence);
  while (!isBefore(endLimit, current)) {
    out.push(new Date(current));
    current = advanceRecurringOccurrence(current, frequency);
  }
  return out;
}
