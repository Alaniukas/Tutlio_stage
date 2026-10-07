import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHOOL_ORG_CALENDAR,
  isSchoolHolidayDisplayDay,
  isSchoolNonWorkingDay,
  parseSchoolOrgCalendar,
  schoolInvoiceDueDateWithCalendar,
} from '../../src/lib/schoolOrgCalendar';
import { isLtPublicHoliday } from '../../src/lib/schoolLtHolidays';

describe('schoolOrgCalendar', () => {
  it('parses org features calendar settings', () => {
    const parsed = parseSchoolOrgCalendar({
      school_org_calendar: {
        include_lt_public_holidays: false,
        custom_closed_dates: ['2026-07-01', 'bad'],
      },
    });
    expect(parsed.include_lt_public_holidays).toBe(false);
    expect(parsed.custom_closed_dates).toEqual(['2026-07-01']);
  });

  it('treats weekends, LT holidays, and custom closures as non-working', () => {
    const calendar = {
      ...DEFAULT_SCHOOL_ORG_CALENDAR,
      custom_closed_dates: ['2026-09-10'],
    };
    expect(isSchoolNonWorkingDay('2026-09-06', calendar)).toBe(true);
    expect(isSchoolNonWorkingDay('2026-09-10', calendar)).toBe(true);
    expect(isSchoolNonWorkingDay('2026-09-08', calendar)).toBe(false);
    expect(isLtPublicHoliday('2026-12-25')).toBe(true);
  });

  it('highlights only holidays and custom closures in UI, not plain weekends', () => {
    const calendar = {
      ...DEFAULT_SCHOOL_ORG_CALENDAR,
      custom_closed_dates: ['2026-09-10'],
    };
    expect(isSchoolHolidayDisplayDay('2026-09-06', calendar)).toBe(false);
    expect(isSchoolHolidayDisplayDay('2026-09-10', calendar)).toBe(true);
    expect(isSchoolHolidayDisplayDay('2026-12-25', calendar)).toBe(true);
  });

  it('skips configured closures when counting invoice due dates', () => {
    const calendar = {
      ...DEFAULT_SCHOOL_ORG_CALENDAR,
      custom_closed_dates: ['2026-09-02', '2026-09-03', '2026-09-04'],
    };
    expect(schoolInvoiceDueDateWithCalendar(new Date('2026-09-01T04:00:00Z'), 5, calendar)).toBe('2026-09-11');
  });
});
