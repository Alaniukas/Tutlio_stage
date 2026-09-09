import { describe, expect, it } from 'vitest';
import { planRecurringSeriesPatches, sortSeriesPatchesForApply } from '@/lib/recurringSessions';

const tue15 = '2026-09-15T15:00:00.000Z';
const tue15end = '2026-09-15T16:00:00.000Z';
const tue22 = '2026-09-22T15:00:00.000Z';
const tue22end = '2026-09-22T16:00:00.000Z';

describe('planRecurringSeriesPatches', () => {
  const rows = [
    { id: 'a', start_time: tue15, end_time: tue15end },
    { id: 'b', start_time: tue22, end_time: tue22end },
  ];

  it('does not rewrite start/end when only price (or other fields) change', () => {
    const patches = planRecurringSeriesPatches(
      rows,
      rows[0],
      { start: new Date(tue15), end: new Date(tue15end) },
      { price: 25 },
    );
    expect(patches).toEqual([
      { id: 'a', patch: { price: 25 } },
      { id: 'b', patch: { price: 25 } },
    ]);
  });

  it('shifts each occurrence instead of stacking every row on the edited datetime', () => {
    const newStart = new Date('2026-09-15T15:30:00.000Z');
    const newEnd = new Date('2026-09-15T16:30:00.000Z');
    const patches = planRecurringSeriesPatches(
      rows,
      rows[0],
      { start: newStart, end: newEnd },
      { price: 25 },
    );
    expect(patches[0].patch.start_time).toBe(newStart.toISOString());
    expect(patches[1].patch.start_time).toBe('2026-09-22T15:30:00.000Z');
    expect(patches[1].patch.end_time).toBe('2026-09-22T16:30:00.000Z');
  });

  it('applies later rows first so a bulk time shift cannot collide', () => {
    const ordered = sortSeriesPatchesForApply(
      [
        { id: 'a', patch: { price: 1 } },
        { id: 'b', patch: { price: 1 } },
      ],
      rows,
    );
    expect(ordered.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('keeps weekly starts unique after a duration-or-clock shift', () => {
    const weekly = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(Date.parse(tue15) + i * 7 * 24 * 60 * 60 * 1000);
      return {
        id: `r${i}`,
        start_time: start.toISOString(),
        end_time: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      };
    });
    const patches = planRecurringSeriesPatches(
      weekly,
      weekly[0],
      { start: new Date('2026-09-15T16:00:00.000Z'), end: new Date('2026-09-15T17:00:00.000Z') },
      { price: 25 },
    );
    const starts = patches.map((row) => row.patch.start_time);
    expect(new Set(starts).size).toBe(weekly.length);
  });

  it('does not throw when edited times are invalid', () => {
    expect(() =>
      planRecurringSeriesPatches(
        rows,
        rows[0],
        { start: new Date('invalid'), end: new Date('invalid') },
        { price: 25 },
      ),
    ).not.toThrow();
  });
});
