import { describe, expect, it } from 'vitest';
import { isFirstLessonForStudentTutorPair } from '@/lib/mvFirstLessonPlanned';

describe('isFirstLessonForStudentTutorPair', () => {
  it('returns true when all sessions for the pair were just created', () => {
    expect(isFirstLessonForStudentTutorPair(1, 1)).toBe(true);
    expect(isFirstLessonForStudentTutorPair(8, 8)).toBe(true);
  });

  it('returns false when prior sessions exist', () => {
    expect(isFirstLessonForStudentTutorPair(2, 1)).toBe(false);
    expect(isFirstLessonForStudentTutorPair(10, 3)).toBe(false);
  });

  it('returns false for empty or invalid batch sizes', () => {
    expect(isFirstLessonForStudentTutorPair(0, 0)).toBe(false);
    expect(isFirstLessonForStudentTutorPair(5, 0)).toBe(false);
  });
});
