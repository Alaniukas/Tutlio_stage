import { describe, expect, it } from 'vitest';
import { attendanceOnlyGroupOccurrences, schoolGroupAttendanceQuery } from '../../src/lib/schoolGroupAttendance';
import type { SchoolClassGroupRecord, SchoolClassGroupRecurrenceExclusion } from '../../src/lib/schoolClassGroups';

const group: SchoolClassGroupRecord = {
  id: 'g1', tutor_id: 'teacher', name: 'Matematika', calendar_name: '5 klasė',
  school_year_start: '2026-09-01', school_year_end: '2027-06-30', duration_minutes: 60,
  slots: [{ weekday: 3, start_time: '09:00', end_time: '10:00' }],
  members: [{ student_id: 'student', student: { full_name: 'Mokinys' } }],
};
const window = {
  start: new Date('2026-09-30T00:00:00Z'), end: new Date('2026-09-30T23:59:59Z'), now: new Date('2026-09-30T12:00:00Z'),
};

describe('attendance-only group occurrences', () => {
  it('offers an ended canonical group slot when every member lacks a real lesson row', () => {
    const entries = attendanceOnlyGroupOccurrences([group], [], window);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      _attendanceOnly: true, _isClassGroup: true, class_group_id: 'g1', tutor_id: 'teacher', student_id: '', topic: '5 klasė',
    });
    expect(entries[0].start_time.toISOString()).toBe('2026-09-30T06:00:00.000Z');
    expect(entries[0].end_time.toISOString()).toBe('2026-09-30T07:00:00.000Z');
    expect(entries[0].id).toMatch(/^classgroup_attendance_/);
    const query = new URLSearchParams(schoolGroupAttendanceQuery({ groupId: entries[0].class_group_id, startTime: entries[0].start_time.toISOString() }));
    expect(query.get('groupId')).toBe('g1');
    expect(query.has('anchorSessionId')).toBe(false);
  });

  it('uses a real group occurrence instead of adding a duplicate attendance-only entry', () => {
    const entries = attendanceOnlyGroupOccurrences([group], [{ class_group_id: 'g1', start_time: new Date('2026-09-30T06:00:00Z') }], window);
    expect(entries).toEqual([]);
  });

  it('does not infer a completed lesson, or expose future, empty or out-of-year slots', () => {
    expect(attendanceOnlyGroupOccurrences([group], [], { ...window, now: new Date('2026-09-30T06:30:00Z') })).toEqual([]);
    expect(attendanceOnlyGroupOccurrences([{ ...group, members: [] }], [], window)).toEqual([]);
    expect(attendanceOnlyGroupOccurrences([{ ...group, school_year_end: '2026-09-29' }], [], window)).toEqual([]);
  });

  it('keeps past factual attendance available after a later group suspension', () => {
    expect(attendanceOnlyGroupOccurrences([{ ...group, suspension_started_at: '2026-10-01T00:00:00Z', suspension_until: '2026-10-15' }], [], window)).toHaveLength(1);
  });

  it.each(['single', 'future', 'all'] as const)('keeps a whole-group %s deletion absent from the calendar', (scope) => {
    const exclusion: SchoolClassGroupRecurrenceExclusion = {
      scope, student_id: null, start_time: scope === 'all' ? null : '2026-09-30T06:00:00Z',
    };
    expect(attendanceOnlyGroupOccurrences([{ ...group, recurrence_exclusions: [exclusion] }], [], window)).toEqual([]);
  });

  it('retains a past occurrence before a future deletion and unrelated single deletions', () => {
    expect(attendanceOnlyGroupOccurrences([{ ...group, recurrence_exclusions: [
      { scope: 'future', student_id: null, start_time: '2026-10-07T06:00:00Z' },
      { scope: 'single', student_id: null, start_time: '2026-09-23T06:00:00Z' },
    ] }], [], window)).toHaveLength(1);
  });

  it.each(['single', 'future', 'all'] as const)('applies a child %s deletion only to that child', (scope) => {
    const exclusion: SchoolClassGroupRecurrenceExclusion = {
      scope, student_id: 'student', start_time: scope === 'all' ? null : '2026-09-30T06:00:00Z',
    };
    expect(attendanceOnlyGroupOccurrences([{ ...group, recurrence_exclusions: [exclusion] }], [], window)).toEqual([]);
    expect(attendanceOnlyGroupOccurrences([{ ...group,
      members: [...group.members!, { student_id: 'another-child' }], recurrence_exclusions: [exclusion],
    }], [], window)).toHaveLength(1);
  });

  it('requires a member enrolled by the occurrence who follows that weekly slot', () => {
    expect(attendanceOnlyGroupOccurrences([{ ...group, members: [{ student_id: 'new-child', enrolled_at: '2026-09-30T06:00:01Z' }] }], [], window)).toEqual([]);
    expect(attendanceOnlyGroupOccurrences([{ ...group, members: [{ student_id: 'same-instant', enrolled_at: '2026-09-30T06:00:00Z' }] }], [], window)).toHaveLength(1);
    expect(attendanceOnlyGroupOccurrences([{ ...group, members: [{ student_id: 'later-slot', schedule_slots: [{ weekday: 3, start_time: '16:00' }] }] }], [], window)).toEqual([]);
    expect(attendanceOnlyGroupOccurrences([{ ...group, members: [{ student_id: 'this-slot', schedule_slots: [{ weekday: 3, start_time: '09:00' }] }] }], [], window)).toHaveLength(1);
  });

  it('limits virtual entries to the current teacher even when an admin response contains other groups', () => {
    const entries = attendanceOnlyGroupOccurrences([group, { ...group, id: 'other-group', tutor_id: 'other-teacher' }], [], { ...window, tutorId: 'teacher' });
    expect(entries.map((entry) => entry.class_group_id)).toEqual(['g1']);
    expect(attendanceOnlyGroupOccurrences([group], [], { ...window, tutorId: '' })).toEqual([]);
  });

  it('keeps Lithuania wall-clock slots correct after the daylight-saving change', () => {
    const entries = attendanceOnlyGroupOccurrences([group], [], {
      start: new Date('2026-10-28T00:00:00Z'), end: new Date('2026-10-28T23:59:59Z'), now: new Date('2026-10-28T12:00:00Z'),
    });
    expect(entries[0].start_time.toISOString()).toBe('2026-10-28T07:00:00.000Z');
    expect(entries[0].end_time.toISOString()).toBe('2026-10-28T08:00:00.000Z');
  });
});
