import { describe, expect, it } from 'vitest';
import {
  classGroupCancelTargets,
  classGroupOccurrenceSessionIds,
  mergeSchoolClassGroupSessions,
  usesClassGroupCancelFlow,
} from '@/lib/schoolClassGroupSessions';

const rows = [
  { id: 'a', student_id: 'lukrecija', status: 'active' },
  { id: 'b', student_id: 'muradov', status: 'cancelled' },
  { id: 'c', student_id: 'tauras', status: 'active' },
  { id: 'd', student_id: 'daniele', status: 'active' },
];

describe('classGroupCancelTargets', () => {
  it('also cancels leftover completed siblings of a group slot', () => {
    expect(
      classGroupCancelTargets(
        [
          { id: 'a', student_id: 's1', status: 'completed' },
          { id: 'b', student_id: 's2', status: 'cancelled' },
          { id: 'c', student_id: 's3', status: 'active' },
        ],
        'whole_occurrence',
        null,
        { includeCompleted: true },
      ).map((r) => r.id),
    ).toEqual(['a', 'c']);
  });

  it('leaves completed siblings alone unless includeCompleted is set', () => {
    expect(
      classGroupCancelTargets(
        [
          { id: 'a', student_id: 's1', status: 'completed' },
          { id: 'b', student_id: 's2', status: 'cancelled' },
          { id: 'c', student_id: 's3', status: 'active' },
        ],
        'whole_occurrence',
      ).map((r) => r.id),
    ).toEqual(['c']);
  });

  it('cancels every remaining active member of the slot', () => {
    expect(classGroupCancelTargets(rows, 'whole_occurrence').map((r) => r.student_id)).toEqual([
      'lukrecija',
      'tauras',
      'daniele',
    ]);
  });

  it('cancels only the chosen student', () => {
    expect(classGroupCancelTargets(rows, 'one_student', 'lukrecija').map((r) => r.id)).toEqual(['a']);
  });

  it('does not cancel an already cancelled row', () => {
    expect(classGroupCancelTargets(rows, 'one_student', 'muradov')).toEqual([]);
  });

  it('uses every merged sibling, not only the calendar display row', () => {
    const start = new Date('2026-09-09T12:00:00+03:00');
    const end = new Date('2026-09-09T12:45:00+03:00');
    const merged = mergeSchoolClassGroupSessions(
      [
        { id: 'a', student_id: 'lukrecija', class_group_id: 'g1', start_time: start, end_time: end, status: 'active' },
        { id: 'b', student_id: 'tauras', class_group_id: 'g1', start_time: start, end_time: end, status: 'active' },
        { id: 'c', student_id: 'daniele', class_group_id: 'g1', start_time: start, end_time: end, status: 'active' },
      ],
      new Map([
        ['g1', { id: 'g1', name: 'Muzikos laboratorija', calendarName: 'Muzikos laboratorija', members: [] }],
      ]),
    );
    const siblings = (merged[0] as { _classGroupSessions: typeof rows })._classGroupSessions;
    expect(siblings).toHaveLength(3);
    expect(classGroupCancelTargets(siblings, 'whole_occurrence').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(classGroupCancelTargets([siblings[0]], 'whole_occurrence').map((r) => r.id)).toEqual(['a']);
  });

  it('class-group slots skip the recurring this-vs-all-future dialog', () => {
    expect(usesClassGroupCancelFlow({ isClassGroupSession: true })).toBe(true);
    expect(usesClassGroupCancelFlow({ classGroupId: 'g1' })).toBe(true);
    expect(usesClassGroupCancelFlow({})).toBe(false);
  });

  it('edits every real sibling id, never the merged calendar row', () => {
    expect(
      classGroupOccurrenceSessionIds([
        { id: 'classgroup_g1_1' },
        { id: 'a' },
        { id: 'b' },
        { id: 'a' },
      ]),
    ).toEqual(['a', 'b']);
  });
});
