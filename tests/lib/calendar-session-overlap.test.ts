import { describe, expect, it } from 'vitest';
import {
  buildSameSlotPeerIdMap,
  hasOverlapWithExclusions,
  intervalsOverlap,
} from '@/lib/calendarSessionOverlap';

describe('calendarSessionOverlap', () => {
  const t1 = '2026-05-09T08:00:00.000Z';
  const t2 = '2026-05-09T09:00:00.000Z';
  const t3 = '2026-05-09T08:30:00.000Z';
  const t4 = '2026-05-09T09:30:00.000Z';

  it('buildSameSlotPeerIdMap groups rows with identical start/end (group lesson peers)', () => {
    const rows = [
      { id: 'a', start_time: t1, end_time: t2 },
      { id: 'b', start_time: t1, end_time: t2 },
      { id: 'c', start_time: t3, end_time: t4 },
    ];
    const map = buildSameSlotPeerIdMap(rows);
    expect(map.get('a')).toEqual(new Set(['a', 'b']));
    expect(map.get('b')).toEqual(new Set(['a', 'b']));
    expect(map.get('c')).toEqual(new Set(['c']));
  });

  it('does not treat same-slot group peer as overlap when saving price-only semantics (no time shift)', () => {
    const rowNewStart = new Date(t1);
    const rowNewEnd = new Date(t2);

    const overlappingFromQuery = [
      { id: 'peer-b', start_time: t1, end_time: t2 },
    ];

    const peers = buildSameSlotPeerIdMap([
      { id: 'session-a', start_time: t1, end_time: t2 },
      { id: 'peer-b', start_time: t1, end_time: t2 },
    ]);

    const exclude = peers.get('session-a') ?? new Set();
    expect(hasOverlapWithExclusions(rowNewStart, rowNewEnd, overlappingFromQuery, exclude)).toBe(false);
  });

  it('still flags a genuine overlap with another lesson that is not a same-slot peer', () => {
    const rowNewStart = new Date(t1);
    const rowNewEnd = new Date(t2);

    const overlappingFromQuery = [{ id: 'other', start_time: t3, end_time: t4 }];

    const peers = buildSameSlotPeerIdMap([{ id: 'session-a', start_time: t1, end_time: t2 }]);
    const exclude = peers.get('session-a') ?? new Set();

    expect(hasOverlapWithExclusions(rowNewStart, rowNewEnd, overlappingFromQuery, exclude)).toBe(true);
  });

  it('intervalsOverlap matches Calendar edge touching used in tutor checks', () => {
    expect(intervalsOverlap(
      new Date(t1).getTime(),
      new Date(t2).getTime(),
      new Date(t2).getTime(),
      new Date(t4).getTime(),
    )).toBe(false);
    expect(intervalsOverlap(
      new Date(t1).getTime(),
      new Date(t2).getTime(),
      new Date(t3).getTime(),
      new Date(t4).getTime(),
    )).toBe(true);
  });
});
