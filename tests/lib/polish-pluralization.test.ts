import { describe, expect, it } from 'vitest';
import { getLessonUnitTranslationKey } from '../../src/lib/lessonUnitTranslation';

describe('Polish lesson-unit pluralization', () => {
  it.each([
    [1, 'package.lessonUnit1'],
    [2, 'package.lessonUnit2to9'],
    [4, 'package.lessonUnit2to9'],
    [5, 'package.lessonUnit10plus'],
    [12, 'package.lessonUnit10plus'],
    [14, 'package.lessonUnit10plus'],
    [21, 'package.lessonUnit10plus'],
    [22, 'package.lessonUnit2to9'],
    [24, 'package.lessonUnit2to9'],
    [25, 'package.lessonUnit10plus'],
    [101, 'package.lessonUnit10plus'],
    [102, 'package.lessonUnit2to9'],
    [112, 'package.lessonUnit10plus'],
  ] as const)('uses the correct form for %i', (count, expectedKey) => {
    expect(getLessonUnitTranslationKey('pl', count)).toBe(expectedKey);
  });
});
