export type SessionTimeSlot = {
  start: Date;
  end: Date;
};

export type BusySessionTime = {
  start_time: unknown;
  end_time: unknown;
};

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
      ? `${conflictCount} kuriamos pamokos nepalieka korepetitoriaus nustatytos ${minutes} min. pertraukos. Ar vis tiek sukurti?`
      : `Ši pamoka nepalieka korepetitoriaus nustatytos ${minutes} min. pertraukos. Ar vis tiek sukurti?`;
  }
  return conflictCount > 1
    ? `${conflictCount} lessons do not leave the tutor's configured ${minutes}-minute break. Create them anyway?`
    : `This lesson does not leave the tutor's configured ${minutes}-minute break. Create it anyway?`;
}
