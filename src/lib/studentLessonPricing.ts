import type { SupabaseClient } from '@supabase/supabase-js';
import {
  contractedLessonsPerWeek,
  resolveOrganizationLessonPrice,
  type DynamicPricingStudent,
  type OrganizationDynamicPricingRule,
} from '@/lib/organizationDynamicPricing';

export type StudentLessonPricingRow = {
  student_id: string;
  subject_id: string;
  price: number;
};

export type StudentLessonPricingContext = {
  student: DynamicPricingStudent | null;
  individualPrice: number | null;
  individualPricingRows: StudentLessonPricingRow[];
  dynamicPricingRules: OrganizationDynamicPricingRule[];
};

export function mapOrganizationDynamicPricingRows(
  rows: Array<Record<string, unknown>> | null | undefined,
): OrganizationDynamicPricingRule[] {
  return (rows ?? []).map((row) => ({
    ...row,
    grade_min: Number(row.grade_min),
    grade_max: Number(row.grade_max),
    lessons_per_week: Number(row.lessons_per_week),
    price: Number(row.price),
  })) as OrganizationDynamicPricingRule[];
}

export async function loadOrganizationDynamicPricingRules(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationDynamicPricingRule[]> {
  const { data, error } = await supabase
    .from('organization_dynamic_pricing')
    .select('id, organization_id, grade_min, grade_max, lessons_per_week, price')
    .eq('organization_id', organizationId);
  if (error) throw new Error(error.message);
  return mapOrganizationDynamicPricingRows(data);
}

export async function loadStudentForPricing(
  supabase: SupabaseClient,
  studentId: string,
): Promise<DynamicPricingStudent | null> {
  const { data, error } = await supabase
    .from('students')
    .select('grade, pricing_lessons_per_week')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DynamicPricingStudent | null) ?? null;
}

export async function loadStudentIndividualPrice(
  supabase: SupabaseClient,
  studentId: string,
  tutorId: string,
  subjectId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('student_individual_pricing')
    .select('price')
    .eq('student_id', studentId)
    .eq('tutor_id', tutorId)
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const price = (data as { price?: number | null } | null)?.price;
  return typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : null;
}

export function individualPricingRowsForSession(
  studentId: string,
  subjectId: string,
  individualPrice: number | null | undefined,
): StudentLessonPricingRow[] {
  if (
    typeof individualPrice !== 'number' ||
    !Number.isFinite(individualPrice) ||
    individualPrice < 0
  ) {
    return [];
  }
  return [{ student_id: studentId, subject_id: subjectId, price: individualPrice }];
}

/** Individual price beats dynamic pricing; trial bookings keep org trial price. */
export function resolveRegularLessonBookingPrice(args: {
  isTrialBooking: boolean;
  trialPrice: number;
  individualPrice?: number | null;
  subjectPrice: number;
  tutorSubjectPrice?: number | null;
  dynamicPricingRules: OrganizationDynamicPricingRule[];
  student: DynamicPricingStudent | null | undefined;
  lessonsPerWeek?: number | null;
  isGroupSubject?: boolean;
  isTrialSubject?: boolean;
}): number {
  if (args.isTrialBooking) {
    return args.trialPrice;
  }

  const rules = args.isGroupSubject || args.isTrialSubject ? [] : args.dynamicPricingRules;
  const fallback = args.tutorSubjectPrice ?? args.subjectPrice;

  return resolveOrganizationLessonPrice({
    rules,
    student: args.student,
    lessonsPerWeek: args.lessonsPerWeek,
    individualPrice: args.individualPrice,
    fallbackPrice: fallback,
  });
}

export async function fetchStudentLessonPricingContext(
  supabase: SupabaseClient,
  args: {
    organizationId: string | null;
    studentId: string;
    tutorId: string;
    subjectId: string;
  },
): Promise<StudentLessonPricingContext> {
  const [student, individualPrice, dynamicPricingRules] = await Promise.all([
    loadStudentForPricing(supabase, args.studentId),
    loadStudentIndividualPrice(supabase, args.studentId, args.tutorId, args.subjectId),
    args.organizationId
      ? loadOrganizationDynamicPricingRules(supabase, args.organizationId)
      : Promise.resolve([]),
  ]);

  return {
    student,
    individualPrice,
    individualPricingRows: individualPricingRowsForSession(
      args.studentId,
      args.subjectId,
      individualPrice,
    ),
    dynamicPricingRules,
  };
}

export function resolveLessonCreatePrice(args: {
  isTrial: boolean;
  isRecurring: boolean;
  firstLessonIsTrial: boolean;
  trialPrice: number;
  individualPrice: number | null;
  subjectPrice: number;
  tutorSubjectPrice?: number | null;
  dynamicPricingRules: OrganizationDynamicPricingRule[];
  student: DynamicPricingStudent | null | undefined;
  recurringWeekdays: number[];
}): number {
  const isOneOffTrial = args.isTrial && !args.isRecurring;
  const regularPrice = resolveRegularLessonBookingPrice({
    isTrialBooking: false,
    trialPrice: args.trialPrice,
    individualPrice: args.individualPrice,
    subjectPrice: args.subjectPrice,
    tutorSubjectPrice: args.tutorSubjectPrice,
    dynamicPricingRules: args.dynamicPricingRules,
    student: args.student,
    lessonsPerWeek: contractedLessonsPerWeek(
      args.isRecurring && !args.isTrial,
      args.recurringWeekdays,
      args.student?.pricing_lessons_per_week,
    ),
  });

  if (args.isRecurring) {
    return regularPrice;
  }
  if (isOneOffTrial) {
    return args.trialPrice;
  }
  return regularPrice;
}
