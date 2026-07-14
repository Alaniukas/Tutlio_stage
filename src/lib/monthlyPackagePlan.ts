const DAY_MS = 86_400_000;

function parseYmd(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatLocalYmd(value: Date): string {
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function endOfMonthYmd(startYmd: string): string {
  const start = parseYmd(startYmd);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function nextMonthFirstYmd(periodYmd: string): string {
  const period = parseYmd(periodYmd);
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/**
 * Packages are sold in calendar-week blocks. A partial first month starts on
 * the plan creation date; subsequent periods start on the first of the month.
 */
export function lessonsForMonthlyPeriod(
  periodStartYmd: string,
  periodEndYmd: string,
  lessonsPerWeek: number,
): number {
  const start = parseYmd(periodStartYmd);
  const end = parseYmd(periodEndYmd);
  if (end < start) return 0;
  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const weeks = Math.ceil(inclusiveDays / 7);
  return weeks * Math.max(1, Math.floor(lessonsPerWeek));
}

export function monthlyPackagePeriodFrom(startYmd: string, lessonsPerWeek: number) {
  const periodEnd = endOfMonthYmd(startYmd);
  return {
    periodStart: startYmd,
    periodEnd,
    totalLessons: lessonsForMonthlyPeriod(startYmd, periodEnd, lessonsPerWeek),
    nextGenerationDate: nextMonthFirstYmd(startYmd),
  };
}
