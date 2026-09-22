export type SessionTimeSlot = {
  start: Date;
  end: Date;
};

export type BusySessionTime = {
  start_time: unknown;
  end_time: unknown;
  id?: string;
};

export type BreakPaddedInterval = {
  tutor_id: string;
  start: Date;
  end: Date;
};

/** Grow each booked lesson by the tutor's break on both sides so that gap is not offered as free time. */
export function expandBusyByBreak<T extends BreakPaddedInterval>(
  intervals: T[],
  breakMinutesByTutor: Record<string, number>,
): T[] {
  return intervals.map((interval) => {
    const padMs = Math.max(0, Number(breakMinutesByTutor[interval.tutor_id]) || 0) * 60_000;
    if (padMs === 0) return interval;
    return {
      ...interval,
      start: new Date(interval.start.getTime() - padMs),
      end: new Date(interval.end.getTime() + padMs),
    };
  });
}

function validDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Returns the proposed slots that leave less than the tutor's configured break
 * either after the existing lesson or after the proposed lesson.
 * Exact lesson overlaps are intentionally included; callers may keep treating
 * those as a hard error before offering the break override.
 */
export function findTutorBreakConflicts(
  proposed: SessionTimeSlot[],
  busyRows: BusySessionTime[],
  breakMinutes: number,
): SessionTimeSlot[] {
  const breakMs = Math.max(0, Number(breakMinutes) || 0) * 60_000;
  if (breakMs === 0 || proposed.length === 0 || busyRows.length === 0) return [];

  const busy = busyRows.flatMap((row) => {
    const start = validDate(row.start_time);
    const end = validDate(row.end_time);
    return start && end && end > start ? [{ start, end }] : [];
  });

  return proposed.filter((slot) => {
    if (!(slot.start instanceof Date) || !(slot.end instanceof Date)) return false;
    if (Number.isNaN(slot.start.getTime()) || Number.isNaN(slot.end.getTime())) return false;
    return busy.some((existing) => (
      slot.start.getTime() < existing.end.getTime() + breakMs
      && existing.start.getTime() < slot.end.getTime() + breakMs
    ));
  });
}

export function tutorBreakOverrideMessage(breakMinutes: number, conflictCount: number, locale = 'lt'): string {
  const minutes = Math.max(0, Math.round(Number(breakMinutes) || 0));
  if (locale.toLowerCase().startsWith('lt')) {
    return conflictCount > 1
      ? `${conflictCount} laikai nepalieka nustatytos ${minutes} min. pertraukos. Ar vis tiek tęsti?`
      : `Šis laikas nepalieka nustatytos ${minutes} min. pertraukos. Ar vis tiek tęsti?`;
  }
  return conflictCount > 1
    ? `${conflictCount} times do not leave the configured ${minutes}-minute break. Continue anyway?`
    : `This time does not leave the configured ${minutes}-minute break. Continue anyway?`;
}
