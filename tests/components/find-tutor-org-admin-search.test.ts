import { describe, expect, it } from 'vitest';
import { addDays, format } from 'date-fns';
import {
  computeTutorSlots,
  type AvailabilityRule,
  type MatchSubject,
} from '../../src/lib/tutorMatching';

describe('org admin lesson search (computeTutorSlots)', () => {
  const tutors = { tutor1: 'Ona' };
  const subjects: MatchSubject[] = [
    { id: 'sub1', name: 'Matematika', price: 25, tutor_id: 'tutor1', duration_minutes: 60 },
  ];

  const availability: AvailabilityRule[] = [
    {
      tutor_id: 'tutor1',
      day_of_week: 1,
      start_time: '16:00',
      end_time: '18:00',
      is_recurring: true,
    },
  ];

  it('finds free slots with only date + global time range (no weekday filter)', () => {
    const monday = new Date();
    const day = monday.getDay();
    const offset = (1 - day + 7) % 7 || 7;
    const nextMonday = addDays(monday, offset);
    const dateFrom = format(nextMonday, 'yyyy-MM-dd');
    const dateTo = dateFrom;

    const slots = computeTutorSlots(availability, [], subjects, tutors, {
      dateFrom,
      dateTo,
      timeFrom: '15:00',
      timeTo: '19:00',
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].tutorId).toBe('tutor1');
    expect(slots[0].subjectName).toBe('Matematika');
  });

  it('filters by subject name when provided', () => {
    const monday = new Date();
    const day = monday.getDay();
    const offset = (1 - day + 7) % 7 || 7;
    const nextMonday = addDays(monday, offset);
    const dateFrom = format(nextMonday, 'yyyy-MM-dd');

    const slots = computeTutorSlots(availability, [], subjects, tutors, {
      dateFrom,
      dateTo: dateFrom,
      timeFrom: '08:00',
      timeTo: '20:00',
      subjectName: 'Anglų kalba',
    });

    expect(slots).toHaveLength(0);
  });
});
