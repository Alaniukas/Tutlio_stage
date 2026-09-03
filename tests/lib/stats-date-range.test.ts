import { describe, expect, it } from 'vitest';
import {
  defaultStatsDateRange,
  normalizeStatsDateRange,
  statsDateRangeKey,
} from '@/lib/statsDateRange';

describe('statsDateRange', () => {
  it('default range spans roughly one year ending today', () => {
    const { start, end } = defaultStatsDateRange();
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(360);
    expect(diffDays).toBeLessThan(367);
  });

  it('normalizes local day bounds for queries', () => {
    const start = new Date(2026, 8, 1, 15, 30, 0);
    const end = new Date(2026, 8, 30, 8, 0, 0);
    const { startIso, endIso } = normalizeStatsDateRange(start, end);
    expect(new Date(startIso).getHours()).toBe(0);
    expect(new Date(endIso).getHours()).toBe(23);
    expect(startIso <= endIso).toBe(true);
  });

  it('stable key for same calendar range', () => {
    const a = statsDateRangeKey({
      start: new Date(2026, 8, 1),
      end: new Date(2026, 8, 30),
    });
    const b = statsDateRangeKey({
      start: new Date(2026, 8, 1, 12, 0),
      end: new Date(2026, 8, 30, 18, 0),
    });
    expect(a).toBe(b);
  });
});
