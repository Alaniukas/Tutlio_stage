import { sessionYmdVilnius } from './schoolExtraLessonsBilling.js';
import { isLtPublicHoliday } from './schoolLtHolidays.js';

export type SchoolOrgCalendarSettings = {
  /** When true, LT public holidays count as non-working for due-date math. */
  include_lt_public_holidays: boolean;
  /** Extra org-specific closure dates (YYYY-MM-DD). */
  custom_closed_dates: string[];
};

export const DEFAULT_SCHOOL_ORG_CALENDAR: SchoolOrgCalendarSettings = {
  include_lt_public_holidays: true,
  custom_closed_dates: [],
};

export function parseSchoolOrgCalendar(features: unknown): SchoolOrgCalendarSettings {
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    return { ...DEFAULT_SCHOOL_ORG_CALENDAR };
  }
  const raw = (features as Record<string, unknown>).school_org_calendar;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_SCHOOL_ORG_CALENDAR };
  }
  const obj = raw as Record<string, unknown>;
  const custom = Array.isArray(obj.custom_closed_dates)
    ? obj.custom_closed_dates
      .map((d) => String(d || '').trim().slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];
  return {
    include_lt_public_holidays: obj.include_lt_public_holidays !== false,
    custom_closed_dates: [...new Set(custom)].sort(),
  };
}

export function serializeSchoolOrgCalendar(calendar: SchoolOrgCalendarSettings): SchoolOrgCalendarSettings {
  const custom = [...new Set(
    (calendar.custom_closed_dates || [])
      .map((d) => String(d || '').trim().slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  )].sort();
  return {
    include_lt_public_holidays: calendar.include_lt_public_holidays !== false,
    custom_closed_dates: custom,
  };
}

export function isWeekendYmd(ymd: string): boolean {
  const day = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function isSchoolNonWorkingDay(
  ymd: string,
  calendar: SchoolOrgCalendarSettings | null | undefined,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  if (isWeekendYmd(ymd)) return true;
  const settings = calendar || DEFAULT_SCHOOL_ORG_CALENDAR;
  if (settings.custom_closed_dates.includes(ymd)) return true;
  if (settings.include_lt_public_holidays && isLtPublicHoliday(ymd)) return true;
  return false;
}

/** UI highlight: LT šventės + mokyklos uždarymo dienos (ne savaitgaliai). */
export function isSchoolHolidayDisplayDay(
  ymd: string,
  calendar: SchoolOrgCalendarSettings | null | undefined,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const settings = calendar || DEFAULT_SCHOOL_ORG_CALENDAR;
  if (settings.custom_closed_dates.includes(ymd)) return true;
  if (settings.include_lt_public_holidays && isLtPublicHoliday(ymd)) return true;
  return false;
}

/** Canonical §5.2: N working days after issue, excluding weekends and configured closures. */
export function schoolInvoiceDueDateWithCalendar(
  issuedAt: Date,
  workingDays = 5,
  calendar?: SchoolOrgCalendarSettings | null,
): string {
  const cursor = new Date(`${sessionYmdVilnius(issuedAt.toISOString())}T12:00:00Z`);
  let remaining = workingDays;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const ymd = cursor.toISOString().slice(0, 10);
    if (!isSchoolNonWorkingDay(ymd, calendar)) remaining--;
  }
  return cursor.toISOString().slice(0, 10);
}
