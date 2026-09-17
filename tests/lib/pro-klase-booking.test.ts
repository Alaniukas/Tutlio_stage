import { describe, expect, it } from 'vitest';
import {
  proKlaseAvailabilitySearchRecurrence,
  proKlaseSchoolYearEndDate,
} from '@/lib/proKlaseBooking';

describe('Pro Klasė availability-search recurrence', () => {
  it('defaults an autumn booking to weekly until the following June 15', () => {
    const start = new Date(2026, 8, 17, 18, 0, 0);
    expect(proKlaseSchoolYearEndDate(start)).toBe('2027-06-15');
    expect(proKlaseAvailabilitySearchRecurrence(start.toISOString())).toEqual({
      frequency: 'weekly',
      weekdays: [start.getDay()],
      endDate: '2027-06-15',
    });
  });

  it('uses the same June through June 15 and the next June for every summer booking', () => {
    expect(proKlaseSchoolYearEndDate(new Date(2027, 2, 2, 18, 0, 0))).toBe('2027-06-15');
    expect(proKlaseSchoolYearEndDate(new Date(2027, 5, 15, 18, 0, 0))).toBe('2027-06-15');
    expect(proKlaseSchoolYearEndDate(new Date(2027, 5, 16, 18, 0, 0))).toBe('2028-06-15');
    expect(proKlaseSchoolYearEndDate(new Date(2027, 6, 20, 18, 0, 0))).toBe('2028-06-15');
    expect(proKlaseSchoolYearEndDate(new Date(2027, 7, 31, 18, 0, 0))).toBe('2028-06-15');
  });

  it('rejects an invalid start', () => {
    expect(proKlaseAvailabilitySearchRecurrence('not-a-date')).toBeNull();
  });
});
