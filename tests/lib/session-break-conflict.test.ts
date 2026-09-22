import { describe, expect, it } from 'vitest';
import { expandBusyByBreak, findTutorBreakConflicts } from '../../src/lib/sessionBreakConflict';

const slot = (start: string, end: string) => ({ start: new Date(start), end: new Date(end) });

describe('findTutorBreakConflicts', () => {
  const busy = [{
    start_time: '2026-09-18T10:00:00.000Z',
    end_time: '2026-09-18T11:00:00.000Z',
  }];

  it('warns when a lesson starts before the configured break after an existing lesson ends', () => {
    expect(findTutorBreakConflicts([
      slot('2026-09-18T11:10:00.000Z', '2026-09-18T12:10:00.000Z'),
    ], busy, 15)).toHaveLength(1);
  });

  it('warns when the proposed lesson would not leave a break before the next lesson', () => {
    expect(findTutorBreakConflicts([
      slot('2026-09-18T09:05:00.000Z', '2026-09-18T09:50:00.000Z'),
    ], busy, 15)).toHaveLength(1);
  });

  it('reserves the configured break on both sides of a booked lesson', () => {
    const lesson = {
      tutor_id: 'rimantas',
      start: new Date('2026-09-29T13:00:00.000Z'),
      end: new Date('2026-09-29T13:45:00.000Z'),
    };
    const [padded] = expandBusyByBreak([lesson], { rimantas: 5 });
    expect(padded.start.toISOString()).toBe('2026-09-29T12:55:00.000Z');
    expect(padded.end.toISOString()).toBe('2026-09-29T13:50:00.000Z');
    expect(expandBusyByBreak([lesson], {})[0]).toEqual(lesson);
  });

  it('allows the exact configured break and disables the rule at zero minutes', () => {
    const proposed = [slot('2026-09-18T11:15:00.000Z', '2026-09-18T12:15:00.000Z')];
    expect(findTutorBreakConflicts(proposed, busy, 15)).toEqual([]);
    expect(findTutorBreakConflicts([
      slot('2026-09-18T11:00:00.000Z', '2026-09-18T12:00:00.000Z'),
    ], busy, 0)).toEqual([]);
  });
});
