import { describe, expect, it } from 'vitest';
import {
  markFirstChronologicalLessonAsTrial,
  summarizePlannedStudentLessons,
} from '@/lib/proKlaseStudentLessonPlan';

describe('markFirstChronologicalLessonAsTrial', () => {
  const picks = [
    { lessonStartIso: '2026-09-10T10:00:00.000Z', pick: { tutorId: 'a' } },
    { lessonStartIso: '2026-09-03T10:00:00.000Z', pick: { tutorId: 'b' } },
  ];

  it('marks all lessons as non-trial when toggle is off', () => {
    const planned = markFirstChronologicalLessonAsTrial(picks, false);
    expect(planned.every((row) => row.isTrial === false)).toBe(true);
  });

  it('marks only the chronologically first lesson as trial when toggle is on', () => {
    const planned = markFirstChronologicalLessonAsTrial(picks, true);
    expect(planned.filter((row) => row.isTrial)).toHaveLength(1);
    expect(planned.find((row) => row.isTrial)?.lessonStartIso).toBe('2026-09-03T10:00:00.000Z');
  });
});

describe('summarizePlannedStudentLessons', () => {
  it('counts trial and regular lessons', () => {
    expect(
      summarizePlannedStudentLessons([
        { isTrial: true },
        { isTrial: false },
        { isTrial: false },
      ]),
    ).toEqual({ totalLessons: 3, trialLessons: 1, regularLessons: 2 });
  });
});
