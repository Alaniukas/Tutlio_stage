export interface OrganizationDynamicPricingRule {
  id?: string;
  organization_id?: string;
  grade_min: number;
  grade_max: number;
  lessons_per_week: number;
  price: number;
}

export interface DynamicPricingStudent {
  grade?: string | null;
  pricing_lessons_per_week?: number | null;
}

interface PostgrestLikeError {
  code?: unknown;
  message?: unknown;
}

export function isDynamicPricingSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const { code, message } = error as PostgrestLikeError;
  const normalizedMessage = String(message ?? '').toLowerCase();

  return (
    code === 'PGRST205' ||
    (code === 'PGRST204' && normalizedMessage.includes('pricing_lessons_per_week'))
  );
}

export function parseStudentGrade(grade: string | null | undefined): number | null {
  const match = String(grade ?? '').match(/\d{1,2}/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

export function contractedLessonsPerWeek(
  isRecurring: boolean,
  recurringWeekdays: number[],
  storedFrequency: number | null | undefined,
): number | null {
  if (isRecurring) {
    const uniqueDays = new Set(
      recurringWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    );
    return uniqueDays.size > 0 ? uniqueDays.size : 1;
  }

  const stored = Number(storedFrequency);
  return Number.isInteger(stored) && stored >= 1 ? stored : null;
}

export function findOrganizationDynamicPrice(
  rules: OrganizationDynamicPricingRule[],
  student: DynamicPricingStudent | null | undefined,
  lessonsPerWeek?: number | null,
): number | null {
  const grade = parseStudentGrade(student?.grade);
  const frequency = lessonsPerWeek ?? student?.pricing_lessons_per_week ?? null;
  if (grade === null || !Number.isInteger(Number(frequency)) || Number(frequency) < 1) return null;

  const matching = rules
    .filter(
      (rule) =>
        Number(rule.lessons_per_week) === Number(frequency) &&
        grade >= Number(rule.grade_min) &&
        grade <= Number(rule.grade_max),
    )
    .sort((a, b) => {
      const aWidth = Number(a.grade_max) - Number(a.grade_min);
      const bWidth = Number(b.grade_max) - Number(b.grade_min);
      return aWidth - bWidth || Number(a.grade_min) - Number(b.grade_min);
    });

  const price = matching[0]?.price;
  return typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : null;
}

export function resolveOrganizationLessonPrice(args: {
  rules: OrganizationDynamicPricingRule[];
  student: DynamicPricingStudent | null | undefined;
  lessonsPerWeek?: number | null;
  individualPrice?: number | null;
  fallbackPrice: number;
}): number {
  if (
    typeof args.individualPrice === 'number' &&
    Number.isFinite(args.individualPrice) &&
    args.individualPrice >= 0
  ) {
    return args.individualPrice;
  }

  return (
    findOrganizationDynamicPrice(args.rules, args.student, args.lessonsPerWeek) ??
    args.fallbackPrice
  );
}
