import { describe, expect, it } from 'vitest';
import {
  schoolJoinOpensAtLabel,
  schoolLessonDayLabel,
  schoolLessonTimeLabel,
} from '../../src/lib/schoolHomeworkTime';

describe('school homework lesson times', () => {
  it('uses the Vilnius clock for lesson and join labels across daylight saving changes', () => {
    expect(schoolLessonTimeLabel('2026-09-10T16:00:00Z')).toBe('19:00');
    expect(schoolLessonTimeLabel('2026-11-10T17:00:00Z')).toBe('19:00');
    expect(schoolLessonDayLabel('2026-09-10T22:30:00Z')).toMatch(/rugsėjo 11/i);
    expect(schoolJoinOpensAtLabel('2026-09-10T16:00:00Z')).toMatch(/18:30/);
  });
});
