import { describe, expect, it } from 'vitest';
import { subtractSessionsFromAvailability } from '@/lib/calendarAvailabilityBlocks';

const time = (value: string) => new Date(`2026-09-08T${value}:00`);
const block = {
  id: 'avail-1', availabilityId: 'rule-1', tutorId: 'tutor-1',
  start: time('12:00'), end: time('13:00'),
};
const lesson = (start: string, end: string, tutor = 'tutor-1', status = 'active') => ({
  tutor_id: tutor, status, start_time: time(start), end_time: time(end),
});
const intervals = (sessions: ReturnType<typeof lesson>[]) =>
  subtractSessionsFromAvailability([block], sessions).map(b => [b.start, b.end]);

describe('calendar availability occupied by lessons', () => {
  it('leaves 12:45–13:00 when a lesson occupies 12:00–12:45', () => {
    expect(intervals([lesson('12:00', '12:45')])).toEqual([[time('12:45'), time('13:00')]]);
  });

  it('splits around a lesson and preserves the availability rule for both pieces', () => {
    const result = subtractSessionsFromAvailability([block], [lesson('12:15', '12:45')]);
    expect(result.map(b => [b.start, b.end])).toEqual([
      [time('12:00'), time('12:15')], [time('12:45'), time('13:00')],
    ]);
    expect(result.map(b => b.availabilityId)).toEqual(['rule-1', 'rule-1']);
    expect(new Set(result.map(b => b.id)).size).toBe(2);
    expect(block.start).toEqual(time('12:00'));
    expect(block.end).toEqual(time('13:00'));
  });

  it('removes fully occupied time, including a lesson extending beyond the rule', () => {
    expect(intervals([lesson('12:00', '13:00')])).toEqual([]);
    expect(intervals([lesson('11:00', '14:00')])).toEqual([]);
  });

  it('handles unordered overlapping lessons and duplicate group member rows', () => {
    expect(intervals([
      lesson('12:30', '12:50'), lesson('11:45', '12:40'), lesson('12:30', '12:50'),
    ])).toEqual([[time('12:50'), time('13:00')]]);
  });

  it('does not subtract another tutor, cancelled lessons, or touching boundaries', () => {
    expect(intervals([
      lesson('12:00', '13:00', 'tutor-2'), lesson('12:00', '13:00', 'tutor-1', 'cancelled'),
      lesson('11:00', '12:00'), lesson('13:00', '14:00'),
    ])).toEqual([[time('12:00'), time('13:00')]]);
  });

  it('restores free time after cancellation and recalculates after rescheduling', () => {
    expect(intervals([lesson('12:00', '12:45', 'tutor-1', 'cancelled')]))
      .toEqual([[time('12:00'), time('13:00')]]);
    expect(intervals([lesson('12:45', '13:30')])).toEqual([[time('12:00'), time('12:45')]]);
  });

  it('retains occupied historical time for completed and no-show lessons', () => {
    expect(intervals([
      lesson('12:00', '12:30', 'tutor-1', 'completed'),
      lesson('12:30', '13:00', 'tutor-1', 'no_show'),
    ])).toEqual([]);
  });

  it('subtracts only the occupied occurrence of a recurring availability rule', () => {
    const next = { ...block, id: 'avail-next', start: new Date('2026-09-15T12:00:00'), end: new Date('2026-09-15T13:00:00') };
    const result = subtractSessionsFromAvailability([block, next], [lesson('12:00', '13:00')]);
    expect(result).toHaveLength(1);
    expect(result[0].start).toEqual(next.start);
    expect(result[0].end).toEqual(next.end);
  });
});
