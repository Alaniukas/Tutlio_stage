import { addDays, addWeeks, addMonths, parseISO, isBefore } from 'date-fns';

/**
 * Open-ended schedules keep only a small rolling calendar window materialized
 * (~2 months). A daily server job extends that window while the student is not
 * archived, so admins never create hundreds of session rows and never need to
 * recreate the schedule manually each month.
 */
export const RECURRING_OPEN_END_HORIZON_DAYS = 60;

export function recurringMaterializeEndDate(
  recurringEndDate: string | null | undefined,
  seriesStart: Date,
): Date {
  const trimmed = (recurringEndDate || '').trim();
  if (trimmed) {
    return parseISO(trimmed);
  }
  return addDays(seriesStart, RECURRING_OPEN_END_HORIZON_DAYS);
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

export type RecurringSeriesTimeRow = {
  id: string;
  start_time: string | Date;
  end_time: string | Date;
};

/**
 * Org "apply to all future" used to stamp the edited row's start/end onto every
 * sibling, stacking dozens of lessons on one day and breaking the week grid.
 * Price/topic-only edits must not rewrite times. Time edits shift each occurrence.
 */
export function planRecurringSeriesPatches(
  rows: RecurringSeriesTimeRow[],
  edited: RecurringSeriesTimeRow,
  next: { start: Date; end: Date },
  sharedFields: Record<string, unknown>,
): Array<{ id: string; patch: Record<string, unknown> }> {
  const oldStartMs = new Date(edited.start_time).getTime();
  const oldEndMs = new Date(edited.end_time).getTime();
  const newStartMs = next.start.getTime();
  const newEndMs = next.end.getTime();
  const timesValid = [oldStartMs, oldEndMs, newStartMs, newEndMs].every(Number.isFinite);
  const timeChanged = timesValid && (oldStartMs !== newStartMs || oldEndMs !== newEndMs);
  const shiftMs = timeChanged ? newStartMs - oldStartMs : 0;
  const durationMs = timesValid ? Math.max(60_000, newEndMs - newStartMs) : 60_000;

  return rows.map((row) => {
    const patch: Record<string, unknown> = { ...sharedFields };
    if (timeChanged) {
      const rowStartMs = new Date(row.start_time).getTime();
      if (!Number.isFinite(rowStartMs)) return { id: row.id, patch };
      const shifted = new Date(rowStartMs + shiftMs);
      patch.start_time = shifted.toISOString();
      patch.end_time = new Date(shifted.getTime() + durationMs).toISOString();
    }
    return { id: row.id, patch };
  });
}

/** Apply later occurrences first so unique (student, start) rows do not collide mid-shift. */
export function sortSeriesPatchesForApply(
  patches: Array<{ id: string; patch: Record<string, unknown> }>,
  rows: RecurringSeriesTimeRow[],
): Array<{ id: string; patch: Record<string, unknown> }> {
  const startById = new Map(rows.map((row) => [row.id, new Date(row.start_time).getTime()]));
  return [...patches].sort((a, b) => (startById.get(b.id) ?? 0) - (startById.get(a.id) ?? 0));
}
