import { describe, expect, it } from 'vitest';
import { filterCalendarGridSessions } from '@/lib/calendarGridSessions';

describe('filterCalendarGridSessions', () => {
  it('drops cancelled rows when another session shares the same start time', () => {
    const start = '2026-10-05T16:00:00+03:00';
    const rows = [
      { id: 'cancelled', status: 'cancelled', start_time: start },
      { id: 'active', status: 'completed', start_time: start },
    ];
    expect(filterCalendarGridSessions(rows).map((row) => row.id)).toEqual(['active']);
  });

  it('keeps standalone cancelled rows', () => {
    const rows = [{ id: 'cancelled', status: 'cancelled', start_time: '2026-10-05T16:00:00+03:00' }];
    expect(filterCalendarGridSessions(rows)).toHaveLength(1);
  });
});
