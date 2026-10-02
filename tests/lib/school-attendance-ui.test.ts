import { describe, expect, it } from 'vitest';
import {
  schoolLessonHasEnded,
  schoolSessionAttendanceSelection,
  schoolSessionNeedsTeacherAttendance,
} from '../../src/lib/schoolAttendanceUi';

describe('schoolAttendanceUi', () => {
  const ended = new Date('2026-09-30T08:00:00Z');
  const afterEnd = new Date('2026-09-30T08:30:00Z');

  it('detects ended lessons and pending confirmations', () => {
    expect(schoolLessonHasEnded(ended, afterEnd)).toBe(true);
    expect(schoolSessionNeedsTeacherAttendance({
      status: 'active',
      end_time: ended,
      status_confirmed_at: null,
    }, true, afterEnd)).toBe(true);
    expect(schoolSessionNeedsTeacherAttendance({
      status: 'completed',
      end_time: ended,
      status_confirmed_at: '2026-09-30T08:05:00Z',
    }, true, afterEnd)).toBe(false);
  });

  it('maps completed, late and no-show selections', () => {
    expect(schoolSessionAttendanceSelection({
      status: 'completed',
      status_confirmed_at: '2026-09-30T08:05:00Z',
      completed_late: false,
      start_time: '2026-09-30T07:00:00Z',
      end_time: ended,
    }, true)).toBe('completed');
    expect(schoolSessionAttendanceSelection({
      status: 'completed',
      status_confirmed_at: '2026-09-30T08:05:00Z',
      completed_late: true,
      start_time: '2026-09-30T07:00:00Z',
      end_time: ended,
    }, true)).toBe('late');
    expect(schoolSessionAttendanceSelection({
      status: 'no_show',
      status_confirmed_at: '2026-09-30T08:05:00Z',
      start_time: '2026-09-30T07:00:00Z',
      end_time: ended,
    }, true)).toBe('no_show');
  });
});
