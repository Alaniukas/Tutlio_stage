import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_GRACE_MS,
  deriveAttendance,
  isAttendanceFlagged,
  isWithinJoinClickWindow,
} from '@/lib/attendance';

const START = '2026-06-12T14:00:00.000Z';
const END = '2026-06-12T15:00:00.000Z';

const at = (offsetMin: number) => new Date(Date.parse(START) + offsetMin * 60 * 1000);
const iso = (offsetMin: number) => at(offsetMin).toISOString();

describe('isWithinJoinClickWindow', () => {
  it('opens 30 min before start and closes at lesson end', () => {
    expect(isWithinJoinClickWindow(at(-31), START, END)).toBe(false);
    expect(isWithinJoinClickWindow(at(-30), START, END)).toBe(true);
    expect(isWithinJoinClickWindow(at(0), START, END)).toBe(true);
    expect(isWithinJoinClickWindow(at(59), START, END)).toBe(true);
    expect(isWithinJoinClickWindow(at(61), START, END)).toBe(false);
  });

  it('falls back to a 2h cutoff when end_time is missing', () => {
    expect(isWithinJoinClickWindow(at(119), START, null)).toBe(true);
    expect(isWithinJoinClickWindow(at(121), START, null)).toBe(false);
  });

  it('rejects invalid start times', () => {
    expect(isWithinJoinClickWindow(at(0), 'not-a-date', END)).toBe(false);
  });
});

describe('deriveAttendance', () => {
  it('is not applicable before the 10 min grace passes', () => {
    const info = deriveAttendance({ start_time: START, end_time: END }, at(5));
    expect(info.applicable).toBe(false);
    expect(info.flagged).toBe(false);
    expect(info.tutor).toBe('pending');
    expect(info.student).toBe('pending');
  });

  it('is never applicable for cancelled lessons', () => {
    const info = deriveAttendance(
      { start_time: START, end_time: END, status: 'cancelled' },
      at(60),
    );
    expect(info.applicable).toBe(false);
    expect(info.flagged).toBe(false);
  });

  it('does not flag when both joined within 10 min of start', () => {
    const info = deriveAttendance(
      {
        start_time: START,
        end_time: END,
        tutor_joined_at: iso(-5),
        student_joined_at: iso(9),
      },
      at(30),
    );
    expect(info.applicable).toBe(true);
    expect(info.tutor).toBe('joined');
    expect(info.student).toBe('joined');
    expect(info.flagged).toBe(false);
  });

  it('flags when the student never joined', () => {
    const info = deriveAttendance(
      { start_time: START, end_time: END, tutor_joined_at: iso(0), student_joined_at: null },
      at(30),
    );
    expect(info.tutor).toBe('joined');
    expect(info.student).toBe('missing');
    expect(info.flagged).toBe(true);
  });

  it('flags when the tutor never joined', () => {
    const info = deriveAttendance(
      { start_time: START, end_time: END, tutor_joined_at: null, student_joined_at: iso(2) },
      at(30),
    );
    expect(info.tutor).toBe('missing');
    expect(info.student).toBe('joined');
    expect(info.flagged).toBe(true);
  });

  it('marks a side late (and flagged) when joined after 10 min', () => {
    const info = deriveAttendance(
      { start_time: START, end_time: END, tutor_joined_at: iso(25), student_joined_at: iso(1) },
      at(40),
    );
    expect(info.tutor).toBe('late');
    expect(info.student).toBe('joined');
    expect(info.flagged).toBe(true);
  });

  it('treats exactly start+10min as joined on time', () => {
    const info = deriveAttendance(
      { start_time: START, end_time: END, tutor_joined_at: iso(10), student_joined_at: iso(10) },
      at(30),
    );
    expect(info.tutor).toBe('joined');
    expect(info.student).toBe('joined');
    expect(info.flagged).toBe(false);
  });

  it('uses the exported grace constant (10 min)', () => {
    expect(ATTENDANCE_GRACE_MS).toBe(10 * 60 * 1000);
  });
});

describe('isAttendanceFlagged', () => {
  it('is false without a meeting link or before grace', () => {
    expect(
      isAttendanceFlagged(
        { start_time: START, end_time: END, tutor_joined_at: null, student_joined_at: null },
        at(5),
      ),
    ).toBe(false);
    expect(
      isAttendanceFlagged(
        {
          start_time: START,
          end_time: END,
          meeting_link: 'https://meet.example.com/x',
          tutor_joined_at: null,
          student_joined_at: null,
        },
        at(5),
      ),
    ).toBe(false);
  });

  it('is true when grace passed and someone is missing', () => {
    expect(
      isAttendanceFlagged(
        {
          start_time: START,
          end_time: END,
          meeting_link: 'https://meet.example.com/x',
          tutor_joined_at: iso(0),
          student_joined_at: null,
        },
        at(30),
      ),
    ).toBe(true);
  });

  it('is false for cancelled or no_show lessons', () => {
    const base = {
      start_time: START,
      end_time: END,
      meeting_link: 'https://meet.example.com/x',
      tutor_joined_at: null,
      student_joined_at: null,
    };
    expect(isAttendanceFlagged({ ...base, status: 'cancelled' }, at(30))).toBe(false);
    expect(isAttendanceFlagged({ ...base, status: 'no_show' }, at(30))).toBe(false);
  });
});
