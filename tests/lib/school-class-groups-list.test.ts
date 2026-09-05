import { describe, expect, it } from 'vitest';
import {
  classGroupMatchesQuery,
  classGroupTutorName,
  groupClassGroupsByTutor,
  type SchoolClassGroupRecord,
} from '../../src/lib/schoolClassGroups';

const base = {
  school_year_start: '2026-09-01',
  school_year_end: '2027-06-15',
  platform: 'Google Meet',
  duration_minutes: 45,
  slots: [{ weekday: 5, start_time: '19:00', end_time: '19:45' }],
};

const groups: SchoolClassGroupRecord[] = [
  { ...base, id: 'a', name: 'Matematika 5 kl.', tutor_id: 't-ona', tutor: { full_name: 'Ona Onaitė' }, members: [{ student_id: 's1', student: { full_name: 'Jonas Jonaitis' } }] },
  { ...base, id: 'b', name: 'Anglų 3 kl.', tutor_id: 't-ona', tutor: { full_name: 'Ona Onaitė' }, members: [] },
  { ...base, id: 'c', name: 'Lietuvių 2 kl.', tutor_id: 't-ben', tutor: { full_name: 'Benas Benaitis' }, members: [{ student_id: 's2', student: { full_name: 'Austėja Mockutė' } }] },
];

describe('groupClassGroupsByTutor', () => {
  it('splits the pile per teacher, sorted by teacher then group name', () => {
    const sections = groupClassGroupsByTutor(groups, (id) => (id === 't-ona' ? 'Ona Onaitė' : 'Benas Benaitis'));
    expect(sections.map((s) => [s.tutorName, s.groups.map((g) => g.name)])).toEqual([
      ['Benas Benaitis', ['Lietuvių 2 kl.']],
      ['Ona Onaitė', ['Anglų 3 kl.', 'Matematika 5 kl.']],
    ]);
  });
});

describe('classGroupMatchesQuery', () => {
  it('matches group name, teacher, members and weekday label, ignoring case', () => {
    expect(classGroupMatchesQuery(groups[0], 'matem')).toBe(true);
    expect(classGroupMatchesQuery(groups[0], 'ona')).toBe(true);
    expect(classGroupMatchesQuery(groups[0], 'jonaitis')).toBe(true);
    expect(classGroupMatchesQuery(groups[0], 'penktadienis')).toBe(true);
    expect(classGroupMatchesQuery(groups[0], 'austėja')).toBe(false);
    expect(classGroupMatchesQuery(groups[2], 'mockutė lietuvių')).toBe(true);
    expect(classGroupMatchesQuery(groups[2], '')).toBe(true);
  });

  it('falls back to the embedded teacher name', () => {
    expect(classGroupTutorName(groups[2], 'Mokytojas')).toBe('Benas Benaitis');
    expect(classGroupTutorName({ ...groups[2], tutor: null }, 'Mokytojas')).toBe('Mokytojas');
  });
});
