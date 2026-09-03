import {
  resolveOrganizationLessonPrice,
  type OrganizationDynamicPricingRule,
} from './organizationDynamicPricing';

export type OrgSubjectForDefaults = {
  id: string;
  name?: string | null;
  price?: number | null;
  duration_minutes?: number | null;
  is_group?: boolean | null;
  is_trial?: boolean | null;
  meeting_link?: string | null;
};

export type OrgStudentForMeetingLink = {
  id: string;
  personal_meeting_link?: string | null;
  grade?: string | null;
  pricing_lessons_per_week?: number | null;
};

export type OrgTrialDefaults = {
  topic: string;
  durationMinutes: number;
  priceEur: number;
};

/** Mokinys → korepetitorius → dalykas (kaip Calendar / org create). */
export function resolveOrgMeetingLink(
  subjectLink: string | undefined | null,
  studentId: string | undefined,
  tutorPersonalLink: string | undefined | null,
  allStudents: OrgStudentForMeetingLink[],
): string {
  const st = studentId ? allStudents.find((s) => s.id === studentId) : undefined;
  const sl = st?.personal_meeting_link;
  if (sl && String(sl).trim()) return String(sl).trim();
  const tp = tutorPersonalLink && String(tutorPersonalLink).trim();
  if (tp) return tp;
  return (subjectLink && String(subjectLink).trim()) || '';
}

export function resolveOrgSessionSubjectDefaults(args: {
  subject: OrgSubjectForDefaults;
  studentId?: string | null;
  tutorId?: string | null;
  students?: OrgStudentForMeetingLink[];
  individualPricing?: Array<{ student_id: string; subject_id: string; price: number }>;
  dynamicPricingRules?: OrganizationDynamicPricingRule[];
  orgSubjectTemplates?: Array<{ id: string; name: string }>;
  tutorSubjectPrices?: Array<{
    tutor_id: string;
    org_subject_template_id: string;
    price: number;
    duration_minutes: number;
  }>;
  tutorPersonalMeetingLink?: string | null;
  trialDefaults?: OrgTrialDefaults | null;
  /** Kai true (create modal trial toggle), dinaminė kaina netaikoma net jei dalykas ne is_trial. */
  forceTrialPricing?: boolean;
  lessonsPerWeek?: number | null;
}): {
  topic: string;
  price: number;
  durationMinutes: number;
  meetingLink: string;
} {
  const {
    subject,
    studentId,
    tutorId,
    students = [],
    individualPricing = [],
    dynamicPricingRules = [],
    orgSubjectTemplates = [],
    tutorSubjectPrices = [],
    tutorPersonalMeetingLink,
    trialDefaults,
    forceTrialPricing = false,
    lessonsPerWeek,
  } = args;

  const isTrialSubject = subject.is_trial === true;
  const useTrialDefaults = (forceTrialPricing || isTrialSubject) && trialDefaults;

  const matchedTpl = orgSubjectTemplates.find(
    (t) => t.name.toLowerCase() === (subject.name || '').toLowerCase(),
  );
  const tsp =
    matchedTpl && tutorId
      ? tutorSubjectPrices.find(
          (p) => p.tutor_id === tutorId && p.org_subject_template_id === matchedTpl.id,
        )
      : undefined;

  const fallbackPrice = tsp?.price ?? subject.price ?? 0;
  const student = studentId ? students.find((s) => s.id === studentId) : undefined;
  const pricing = studentId
    ? individualPricing.find((p) => p.student_id === studentId && p.subject_id === subject.id)
    : undefined;

  let price = fallbackPrice;
  if (useTrialDefaults) {
    price = trialDefaults!.priceEur;
  } else if (studentId && !subject.is_group && !isTrialSubject) {
    price = resolveOrganizationLessonPrice({
      rules: dynamicPricingRules,
      student,
      lessonsPerWeek: lessonsPerWeek ?? student?.pricing_lessons_per_week ?? 1,
      individualPrice: pricing?.price,
      fallbackPrice,
    });
  }

  let durationMinutes = tsp?.duration_minutes ?? subject.duration_minutes ?? 60;
  if (useTrialDefaults) {
    durationMinutes = trialDefaults!.durationMinutes;
  }

  const topic =
    useTrialDefaults && trialDefaults!.topic.trim()
      ? trialDefaults!.topic.trim()
      : (subject.name || '');

  const meetingLink = resolveOrgMeetingLink(
    subject.meeting_link,
    studentId || undefined,
    tutorPersonalMeetingLink,
    students,
  );

  return { topic, price, durationMinutes, meetingLink };
}
