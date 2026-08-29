import {
  LANDING_LESSON_ESTIMATE_BASE,
  estimatedLandingLessonCount,
  landingLessonDailyIncrement,
  publicLandingLessonCount,
} from '../../src/lib/landingLessonEstimate';

describe('landing lesson estimate', () => {
  it('starts from the conservative cumulative baseline', () => {
    expect(estimatedLandingLessonCount(new Date('2026-08-29T12:00:00Z')))
      .toBe(LANDING_LESSON_ESTIMATE_BASE);
  });

  it('adds a different stable 10–30 lessons on every UTC day', () => {
    let previous = estimatedLandingLessonCount(new Date('2026-08-29T12:00:00Z'));
    let previousIncrement: number | null = null;

    for (let day = 1; day <= 60; day += 1) {
      const current = estimatedLandingLessonCount(
        new Date(Date.UTC(2026, 7, 29 + day, 12)),
      );
      const increment = current - previous;
      expect(increment).toBe(landingLessonDailyIncrement(day));
      expect(increment).toBeGreaterThanOrEqual(10);
      expect(increment).toBeLessThanOrEqual(30);
      expect(increment).not.toBe(previousIncrement);
      previousIncrement = increment;
      previous = current;
    }
  });

  it('shows a higher genuine live count instead of suppressing it', () => {
    expect(publicLandingLessonCount(2_500, new Date('2026-08-29T12:00:00Z')))
      .toBe(2_500);
  });

  it('uses the estimate while the incomplete live total is lower', () => {
    expect(publicLandingLessonCount(1_249, new Date('2026-08-29T12:00:00Z')))
      .toBe(LANDING_LESSON_ESTIMATE_BASE);
  });
});
