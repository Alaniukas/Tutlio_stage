export type UsConsultationRow = {
  status: string;
  mode?: string | null;
  planned_minutes?: number | null;
  reserved_minutes?: number | null;
  charged_minutes?: number | null;
  start_time?: string | null;
  outcome?: string | null;
};

const ACTIVE_RESERVED_STATUSES = new Set(['confirmed', 'awaiting_parent_confirm', 'proposed']);
const CHARGED_OUTCOMES = new Set(['occurred', 'no_show']);

export function usMinutesCharged(row: UsConsultationRow): number {
  if (row.charged_minutes != null && row.charged_minutes >= 0) return row.charged_minutes;
  if (!CHARGED_OUTCOMES.has(String(row.outcome || ''))) return 0;
  if (row.mode === 'group' && row.outcome === 'no_show') return 0;
  return Math.max(0, Number(row.planned_minutes) || 0);
}

export function usMinutesReserved(row: UsConsultationRow, now = Date.now()): number {
  if (!ACTIVE_RESERVED_STATUSES.has(row.status) && row.status !== 'confirmed') return 0;
  if (row.outcome) return 0;
  const start = row.start_time ? new Date(row.start_time).getTime() : NaN;
  if (Number.isFinite(start) && start <= now) return 0;
  if (row.reserved_minutes != null) return Math.max(0, row.reserved_minutes);
  return Math.max(0, Number(row.planned_minutes) || 0);
}

export type UsBalanceInput = {
  annualLimit: number | null;
  consultations: UsConsultationRow[];
};

export type UsBalance = {
  annualLimit: number | null;
  usedMinutes: number;
  reservedMinutes: number;
  remainingMinutes: number | null;
};

export function computeUsBalance(input: UsBalanceInput): UsBalance {
  const { annualLimit, consultations } = input;
  if (annualLimit === null) {
    return { annualLimit: null, usedMinutes: 0, reservedMinutes: 0, remainingMinutes: null };
  }
  let used = 0;
  let reserved = 0;
  for (const row of consultations) {
    used += usMinutesCharged(row);
    reserved += usMinutesReserved(row);
  }
  const remaining = Math.max(0, annualLimit - used - reserved);
  return { annualLimit, usedMinutes: used, reservedMinutes: reserved, remainingMinutes: remaining };
}

/** Individual UŠ: block if planned duration exceeds remaining balance. */
export function cannotExceedIndividualUs(
  remainingMinutes: number | null,
  plannedMinutes: number,
  mode: string,
): boolean {
  if (mode !== 'individual') return false;
  if (remainingMinutes === null) return false;
  return plannedMinutes > remainingMinutes;
}

/** Minutes to reserve/charge for group participation. */
export function groupUsChargeMinutes(
  remainingMinutes: number | null,
  plannedMinutes: number,
): number {
  if (remainingMinutes === null) return 0;
  return Math.min(remainingMinutes, Math.max(0, plannedMinutes));
}
