/** Last teaching day used for Pro Klasė recurring bookings. */
export const PRO_KLASE_SCHOOL_YEAR_END_MONTH_INDEX = 5; // June
export const PRO_KLASE_SCHOOL_YEAR_END_DAY = 15;

function localYmd(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Pro Klasė availability-search bookings default to a weekly schedule through
 * the current school year. The booking form may change the frequency or add a
 * second weekday. Summer bookings target the following June.
 */
export function proKlaseSchoolYearEndDate(seriesStart: Date): string {
  if (Number.isNaN(seriesStart.getTime())) return '';
  const year = seriesStart.getFullYear();
  const thisYearEnd = new Date(
    year,
    PRO_KLASE_SCHOOL_YEAR_END_MONTH_INDEX,
    PRO_KLASE_SCHOOL_YEAR_END_DAY,
    23,
    59,
    59,
    999,
  );
  const endYear = seriesStart.getTime() <= thisYearEnd.getTime() ? year : year + 1;
  return localYmd(
    endYear,
    PRO_KLASE_SCHOOL_YEAR_END_MONTH_INDEX,
    PRO_KLASE_SCHOOL_YEAR_END_DAY,
  );
}

export function proKlaseAvailabilitySearchRecurrence(startIso: string): {
  frequency: 'weekly';
  weekdays: number[];
  endDate: string;
} | null {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  return {
    frequency: 'weekly',
    weekdays: [start.getDay()],
    endDate: proKlaseSchoolYearEndDate(start),
  };
}
