/** Lithuanian public holidays (Labour Code Art. 123) + movable Easter Monday. */

const LT_FIXED_MM_DD = new Set([
  '01-01', '02-16', '03-11', '05-01', '06-24', '07-06', '08-15',
  '11-01', '11-02', '12-24', '12-25', '12-26',
]);

export function easterMondayYmd(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function isLtFixedPublicHoliday(ymd: string): boolean {
  return LT_FIXED_MM_DD.has(ymd.slice(5));
}

export function isLtPublicHoliday(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  if (isLtFixedPublicHoliday(ymd)) return true;
  const year = Number(ymd.slice(0, 4));
  return ymd === easterMondayYmd(year);
}

/** All LT public holiday YYYY-MM-DD values for a calendar year. */
export function ltPublicHolidayDates(year: number): string[] {
  const dates = [`${year}-01-01`, `${year}-02-16`, `${year}-03-11`, `${year}-05-01`,
    `${year}-06-24`, `${year}-07-06`, `${year}-08-15`, `${year}-11-01`, `${year}-11-02`,
    `${year}-12-24`, `${year}-12-25`, `${year}-12-26`];
  dates.push(easterMondayYmd(year));
  return dates.sort();
}
