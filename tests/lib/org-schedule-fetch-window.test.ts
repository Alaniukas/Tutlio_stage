import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { scheduleFetchWindow, scheduleFetchWindowKey } from '../../src/lib/orgScheduleFetchWindow';

describe('scheduleFetchWindow', () => {
  it('loads roughly one calendar month plus padding', () => {
    const anchor = new Date('2026-10-15T12:00:00');
    const { start, end } = scheduleFetchWindow(anchor, 'month', { paddingDays: 7 });
    expect(format(start, 'yyyy-MM-dd')).toBe('2026-09-24');
    expect(format(end, 'yyyy-MM-dd')).toBe('2026-11-07');
  });

  it('loads one week plus padding', () => {
    const anchor = new Date('2026-10-08T12:00:00');
    const { start, end } = scheduleFetchWindow(anchor, 'week', { paddingDays: 1, weekStartsOn: 1 });
    expect(format(start, 'yyyy-MM-dd')).toBe('2026-10-04');
    expect(format(end, 'yyyy-MM-dd')).toBe('2026-10-12');
  });

  it('builds a stable cache key for the window', () => {
    const start = new Date('2026-10-01T00:00:00.000Z');
    const end = new Date('2026-10-31T23:59:59.999Z');
    expect(scheduleFetchWindowKey(start, end)).toBe('2026-10-01_2026-10-31');
  });
});
