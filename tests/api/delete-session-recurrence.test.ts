import { describe, expect, it } from 'vitest';
import { isSessionOccurrenceExcluded, loadSessionRecurrenceExclusions, type SessionRecurrenceExclusion } from '../../api/_lib/sessionRecurrenceExclusions';

describe('deleted recurring occurrences', () => {
  it('loads exclusions beyond Supabase response caps so later school-year deletions remain absent', async () => {
    const stored = Array.from({ length: 1003 }, (_, index) => ({ recurring_session_id: null, class_group_id: 'group',
      student_id: `student-${index}`, scope: 'single' as const, start_time: '2030-01-04T10:00:00Z' }));
    const pages: number[] = [];
    const client = { from: () => {
      let start = 0; let end = 0;
      const query: any = { select: () => query, eq: () => query, order: () => query,
        range: (first: number, last: number) => { start = first; end = last; pages.push(first); return query; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: stored.slice(start, end + 1), error: null }).then(resolve) };
      return query;
    } } as any;
    const loaded = await loadSessionRecurrenceExclusions(client, { classGroupId: 'group' });
    expect(pages).toEqual([0, 500, 1000]);
    expect(isSessionOccurrenceExcluded(loaded, 'student-1002', '2030-01-04T12:00:00+02:00')).toBe(true);
    expect(isSessionOccurrenceExcluded(loaded, 'unrelated-child', '2030-01-04T10:00:00Z')).toBe(false);
  });

  it('blocks the chosen future range for the whole group while preserving earlier dates', () => {
    const exclusions: SessionRecurrenceExclusion[] = [{ recurring_session_id: null, class_group_id: 'group', student_id: null,
      scope: 'future', start_time: '2030-01-04T10:00:00Z' }];
    expect(isSessionOccurrenceExcluded(exclusions, 'child', '2029-12-28T10:00:00Z')).toBe(false);
    expect(isSessionOccurrenceExcluded(exclusions, 'child', '2030-01-04T10:00:00Z')).toBe(true);
    expect(isSessionOccurrenceExcluded(exclusions, 'new-child', '2030-06-01T10:00:00Z')).toBe(true);
  });

  it('allows pre-migration reads but fails closed for database errors after migration', async () => {
    const client = (code: string) => ({ from: () => {
      const query: any = { select: () => query, eq: () => query, order: () => query, range: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { code, message: 'database unavailable' } }).then(resolve) };
      return query;
    } }) as any;
    expect(await loadSessionRecurrenceExclusions(client('42P01'), { recurringSessionId: 'series' })).toEqual([]);
    await expect(loadSessionRecurrenceExclusions(client('08006'), { recurringSessionId: 'series' })).rejects.toThrow('database unavailable');
  });
});
