import { describe, expect, it } from 'vitest';
import {
  contractedLessonsPerWeek,
  findOrganizationDynamicPrice,
  isDynamicPricingSchemaMissing,
  parseStudentGrade,
  resolveOrganizationLessonPrice,
  type OrganizationDynamicPricingRule,
} from '../../src/lib/organizationDynamicPricing';

const rules: OrganizationDynamicPricingRule[] = [
  { grade_min: 1, grade_max: 8, lessons_per_week: 3, price: 22 },
  { grade_min: 9, grade_max: 10, lessons_per_week: 3, price: 24 },
  { grade_min: 11, grade_max: 12, lessons_per_week: 3, price: 26 },
  { grade_min: 1, grade_max: 8, lessons_per_week: 2, price: 25 },
  { grade_min: 9, grade_max: 10, lessons_per_week: 2, price: 27 },
  { grade_min: 11, grade_max: 12, lessons_per_week: 2, price: 29 },
  { grade_min: 1, grade_max: 8, lessons_per_week: 1, price: 27 },
  { grade_min: 9, grade_max: 10, lessons_per_week: 1, price: 29 },
  { grade_min: 11, grade_max: 12, lessons_per_week: 1, price: 31 },
];

describe('organization dynamic pricing', () => {
  it('recognizes only dynamic-pricing schema rollout errors', () => {
    expect(
      isDynamicPricingSchemaMissing({
        code: 'PGRST205',
        message: "Could not find the table 'public.organization_dynamic_pricing' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isDynamicPricingSchemaMissing({
        code: 'PGRST204',
        message: "Could not find the 'pricing_lessons_per_week' column of 'students'",
      }),
    ).toBe(true);
    expect(isDynamicPricingSchemaMissing({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  it('parses Lithuanian grade values and rejects non-school levels', () => {
    expect(parseStudentGrade('1 klasė')).toBe(1);
    expect(parseStudentGrade('10 klasė')).toBe(10);
    expect(parseStudentGrade('Studentas')).toBeNull();
    expect(parseStudentGrade('13')).toBeNull();
  });

  it('matches grade range and contracted weekly frequency', () => {
    expect(findOrganizationDynamicPrice(rules, { grade: '7 klasė' }, 3)).toBe(22);
    expect(findOrganizationDynamicPrice(rules, { grade: '9 klasė' }, 2)).toBe(27);
    expect(findOrganizationDynamicPrice(rules, { grade: '12 klasė' }, 1)).toBe(31);
  });

  it('uses recurring weekdays for a new plan but stored frequency for an extra lesson', () => {
    expect(contractedLessonsPerWeek(true, [1, 3, 5], 1)).toBe(3);
    expect(contractedLessonsPerWeek(false, [], 2)).toBe(2);
    expect(contractedLessonsPerWeek(false, [], null)).toBeNull();
  });

  it('keeps individual pricing above the organization rule', () => {
    expect(
      resolveOrganizationLessonPrice({
        rules,
        student: { grade: '6 klasė', pricing_lessons_per_week: 2 },
        individualPrice: 19,
        fallbackPrice: 30,
      }),
    ).toBe(19);
  });

  it('falls back when no organization rule matches', () => {
    expect(
      resolveOrganizationLessonPrice({
        rules: [],
        student: { grade: '6 klasė', pricing_lessons_per_week: 2 },
        fallbackPrice: 30,
      }),
    ).toBe(30);
  });
});
