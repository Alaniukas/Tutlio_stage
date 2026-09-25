import { describe, expect, it } from 'vitest';
import type { OrganizationDynamicPricingRule } from '../../src/lib/organizationDynamicPricing';
import {
  individualPricingRowsForSession,
  resolveLessonCreatePrice,
  resolveRegularLessonBookingPrice,
} from '../../src/lib/studentLessonPricing';

const rules: OrganizationDynamicPricingRule[] = [
  { grade_min: 1, grade_max: 8, lessons_per_week: 2, price: 25 },
];

describe('student lesson pricing', () => {
  it('keeps individual price above dynamic pricing for regular lessons', () => {
    expect(
      resolveRegularLessonBookingPrice({
        isTrialBooking: false,
        trialPrice: 10,
        individualPrice: 19,
        subjectPrice: 0,
        dynamicPricingRules: rules,
        student: { grade: '6 klasė', pricing_lessons_per_week: 2 },
        lessonsPerWeek: 2,
      }),
    ).toBe(19);
  });

  it('uses dynamic pricing when no individual price is set', () => {
    expect(
      resolveRegularLessonBookingPrice({
        isTrialBooking: false,
        trialPrice: 10,
        individualPrice: null,
        subjectPrice: 0,
        dynamicPricingRules: rules,
        student: { grade: '6 klasė', pricing_lessons_per_week: 2 },
        lessonsPerWeek: 2,
      }),
    ).toBe(25);
  });

  it('uses trial price for trial bookings and ignores individual pricing', () => {
    expect(
      resolveRegularLessonBookingPrice({
        isTrialBooking: true,
        trialPrice: 10,
        individualPrice: 19,
        subjectPrice: 0,
        dynamicPricingRules: rules,
        student: { grade: '6 klasė', pricing_lessons_per_week: 2 },
        lessonsPerWeek: 2,
      }),
    ).toBe(10);
  });

  it('builds individual pricing rows for session creation', () => {
    expect(individualPricingRowsForSession('student-1', 'subject-1', 21)).toEqual([
      { student_id: 'student-1', subject_id: 'subject-1', price: 21 },
    ]);
    expect(individualPricingRowsForSession('student-1', 'subject-1', null)).toEqual([]);
  });

  it('resolves create price for recurring first-lesson trial as regular price', () => {
    expect(
      resolveLessonCreatePrice({
        isTrial: false,
        isRecurring: true,
        firstLessonIsTrial: true,
        trialPrice: 10,
        individualPrice: 19,
        subjectPrice: 0,
        dynamicPricingRules: rules,
        student: { grade: '6 klasė', pricing_lessons_per_week: 2 },
        recurringWeekdays: [1, 3],
      }),
    ).toBe(19);
  });

  it('resolves one-off trial create price from org trial price', () => {
    expect(
      resolveLessonCreatePrice({
        isTrial: true,
        isRecurring: false,
        firstLessonIsTrial: false,
        trialPrice: 10,
        individualPrice: 19,
        subjectPrice: 0,
        dynamicPricingRules: rules,
        student: { grade: '6 klasė', pricing_lessons_per_week: 2 },
        recurringWeekdays: [],
      }),
    ).toBe(10);
  });
});
