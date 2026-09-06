import { describe, expect, it } from 'vitest';
import { studentMayUseClassGroup } from '../../src/lib/schoolClassGroupAccess';

describe('studentMayUseClassGroup', () => {
  it('allows ordinary class groups by membership even when classmates have extra-lessons offers', () => {
    expect(studentMayUseClassGroup('g1', {
      memberGroupIds: new Set(['g1']),
      extraLessonsGroupIds: new Set(),
      signedExtraGroupIds: new Set(),
    })).toBe(true);
  });

  it('blocks extra-lessons groups until that group is signed', () => {
    expect(studentMayUseClassGroup('g2', {
      memberGroupIds: new Set(['g1', 'g2']),
      extraLessonsGroupIds: new Set(['g1', 'g2']),
      signedExtraGroupIds: new Set(['g1']),
    })).toBe(false);
    expect(studentMayUseClassGroup('g1', {
      memberGroupIds: new Set(['g1', 'g2']),
      extraLessonsGroupIds: new Set(['g1', 'g2']),
      signedExtraGroupIds: new Set(['g1']),
    })).toBe(true);
  });
});
