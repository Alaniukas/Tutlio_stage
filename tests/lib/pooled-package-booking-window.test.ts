import { describe, expect, it } from 'vitest';
import { packageCoversLessonDate } from '../../src/lib/pooledPackageBookingWindow';

describe('pooled package lesson dates', () => {
  const pkg = { pool_organization_id: 'org', billing_period_start: '2026-09-01', billing_period_end: '2026-09-30' };
  it('includes both boundaries in Vilnius time', () => {
    expect(packageCoversLessonDate(pkg, new Date('2026-08-31T21:00:00Z'))).toBe(true);
    expect(packageCoversLessonDate(pkg, new Date('2026-09-30T20:59:59Z'))).toBe(true);
  });
  it('does not attach September credits to an October recurring occurrence', () => {
    expect(packageCoversLessonDate(pkg, new Date('2026-09-30T21:00:00Z'))).toBe(false);
    expect(packageCoversLessonDate(pkg, new Date('2026-08-31T20:59:59Z'))).toBe(false);
  });
  it('rejects malformed pooled periods but preserves legacy packages', () => {
    expect(packageCoversLessonDate({ pool_organization_id: 'org' }, new Date())).toBe(false);
    expect(packageCoversLessonDate({}, new Date('2027-01-01'))).toBe(true);
  });
});
