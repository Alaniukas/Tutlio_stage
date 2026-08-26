export type EnrollmentStatus = 'active' | 'future' | 'left' | 'graduated';

export type ExitReason =
  | 'chose_other_school'
  | 'returned_to_contact'
  | 'moved_abroad'
  | 'school_terminated'
  | 'other';

export type EnrollmentStatusFilter = 'all' | EnrollmentStatus;
export type DebtFilter = 'all' | 'yes' | 'no';
export type ExitReasonFilter = 'all' | ExitReason;

export const SCHOOL_YEAR_OPTIONS = ['2026/2027', '2027/2028'] as const;

/** Grades 0–10 stored like existing school UI (`"5 klasė"`). */
export const GRADE_OPTIONS: string[] = Array.from({ length: 11 }, (_, n) => `${n} klasė`);

export const ENROLLMENT_STATUSES: EnrollmentStatus[] = ['active', 'future', 'left', 'graduated'];

export const EXIT_REASONS: ExitReason[] = [
  'chose_other_school',
  'returned_to_contact',
  'moved_abroad',
  'school_terminated',
  'other',
];

/**
 * Academic year suggestion:
 * Sep 1 of Y through June 13 of Y+1 → `Y/(Y+1)`.
 * From June 14 onward (until next Sep) → calendar year C → `C/(C+1)`.
 */
export function suggestSchoolYear(date: Date = new Date()): string {
  const y = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const day = date.getDate();
  // Jan 1 – June 13 → still previous Sep start
  if (month < 5 || (month === 5 && day < 14)) {
    return `${y - 1}/${y}`;
  }
  // June 14 – Dec 31 → y/(y+1) (includes upcoming year in summer + current after Sep 1)
  return `${y}/${y + 1}`;
}

export function normalizeEnrollmentStatus(
  status: string | null | undefined,
): EnrollmentStatus {
  const v = String(status || '').trim().toLowerCase();
  if (v === 'future' || v === 'left' || v === 'graduated') return v;
  return 'active';
}

export function isArchivedEnrollmentStatus(
  status: string | null | undefined,
): boolean {
  const s = normalizeEnrollmentStatus(status);
  return s === 'left' || s === 'graduated';
}

export function studentHasDebt(input: {
  hasDebtManual?: boolean | null;
  unpaidInstallments?: number | null;
  unpaidMonthlyInvoices?: number | null;
}): boolean {
  if (input.hasDebtManual) return true;
  if ((input.unpaidInstallments ?? 0) > 0) return true;
  if ((input.unpaidMonthlyInvoices ?? 0) > 0) return true;
  return false;
}

export function matchesEnrollmentStatusFilter(
  status: string | null | undefined,
  filter: EnrollmentStatusFilter,
): boolean {
  if (filter === 'all') return true;
  return normalizeEnrollmentStatus(status) === filter;
}

export function matchesSchoolYearFilter(
  schoolYear: string | null | undefined,
  filter: string,
): boolean {
  if (filter === 'all') return true;
  return String(schoolYear || '').trim() === filter;
}

export function matchesMunicipalityFilter(
  municipality: string | null | undefined,
  filter: string | string[],
): boolean {
  if (filter === 'all' || (Array.isArray(filter) && filter.length === 0)) return true;
  const studentList = String(municipality || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!studentList.length) return false;
  const wanted = Array.isArray(filter) ? filter : [filter];
  if (wanted.length === 1 && wanted[0] === 'all') return true;
  return wanted.some((w) => studentList.includes(w));
}

export function matchesExitReasonFilter(
  exitReason: string | null | undefined,
  filter: ExitReasonFilter,
): boolean {
  if (filter === 'all') return true;
  return String(exitReason || '').trim() === filter;
}

export function matchesDebtFilter(
  hasDebt: boolean,
  filter: DebtFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'yes') return hasDebt;
  return !hasDebt;
}

/** Inclusive YYYY-MM-DD range; empty bounds ignored. */
export function matchesExitDateRange(
  exitDate: string | null | undefined,
  from: string,
  to: string,
): boolean {
  const fromTrim = String(from || '').trim();
  const toTrim = String(to || '').trim();
  if (!fromTrim && !toTrim) return true;
  const d = String(exitDate || '').trim();
  if (!d) return false;
  if (fromTrim && d < fromTrim) return false;
  if (toTrim && d > toTrim) return false;
  return true;
}

export function enrollmentStatusLabelKey(status: EnrollmentStatus): string {
  switch (status) {
    case 'future':
      return 'compStu.enrollmentStatusFuture';
    case 'left':
      return 'compStu.enrollmentStatusLeft';
    case 'graduated':
      return 'compStu.enrollmentStatusGraduated';
    default:
      return 'compStu.enrollmentStatusActive';
  }
}

export function exitReasonLabelKey(reason: ExitReason): string {
  switch (reason) {
    case 'chose_other_school':
      return 'compStu.exitReasonChoseOtherSchool';
    case 'returned_to_contact':
      return 'compStu.exitReasonReturnedToContact';
    case 'moved_abroad':
      return 'compStu.exitReasonMovedAbroad';
    case 'school_terminated':
      return 'compStu.exitReasonSchoolTerminated';
    default:
      return 'compStu.exitReasonOther';
  }
}
