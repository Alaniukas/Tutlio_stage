import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrgVisibleTutors, type OrgTutorRow } from './orgVisibleTutors.js';
import { ORG_STUDENT_PICKER_SELECT } from './orgStudentIdentity.js';
import type { OrganizationDynamicPricingRule } from './organizationDynamicPricing.js';
import { withRequestDeadline } from './requestDeadline.js';

export type OrgScheduleMetadata<TSubject, TStudent> = {
  orgTutors: OrgTutorRow[];
  subjects: TSubject[];
  students: TStudent[];
  individualPricing: Array<{ student_id: string; subject_id: string; price: number }>;
  tutorSubjectPrices: Array<{ tutor_id: string; org_subject_template_id: string; price: number; duration_minutes: number }>;
  dynamicPricingRules: OrganizationDynamicPricingRule[];
  orgSubjectTemplates: Array<{ id: string; name: string }>;
  orgUsesLicenses: boolean;
};

/** Availability is a separate read: its failure must not hide the roster. */
export async function loadOrgScheduleMetadata<TSubject, TStudent extends { id: string }>(
  client: SupabaseClient,
  organizationId: string,
  includeDynamicPricing: boolean,
): Promise<OrgScheduleMetadata<TSubject, TStudent>> {
  return withRequestDeadline(async (signal) => {
    const orgTutors = await getOrgVisibleTutors(client, organizationId,
      'id, full_name, email, has_active_license, personal_meeting_link, break_between_lessons, teaching_notes',
      { strict: true, signal });
    const tutorIds = orgTutors.map(tutor => tutor.id);
    const studentSelect = `${ORG_STUDENT_PICKER_SELECT}, payment_model, personal_meeting_link, pricing_lessons_per_week`;
    const checked = async <T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> => {
      const result = await query;
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const [subjects, byTutor, byOrg, individualPricing, tutorSubjectPrices, org, dynamicRows] = await Promise.all([
      tutorIds.length ? checked(client.from('subjects').select('*').in('tutor_id', tutorIds).abortSignal(signal)) : [],
      tutorIds.length ? checked(client.from('students').select(studentSelect).in('tutor_id', tutorIds)
        .is('detached_at', null).abortSignal(signal)) : [],
      checked(client.from('students').select(studentSelect).eq('organization_id', organizationId)
        .is('detached_at', null).abortSignal(signal)),
      tutorIds.length ? checked(client.from('student_individual_pricing').select('student_id, subject_id, price')
        .in('tutor_id', tutorIds).abortSignal(signal)) : [],
      tutorIds.length ? checked(client.from('tutor_subject_prices').select('tutor_id, org_subject_template_id, price, duration_minutes')
        .in('tutor_id', tutorIds).abortSignal(signal)) : [],
      checked(client.from('organizations').select('org_subject_templates, tutor_license_count').eq('id', organizationId)
        .abortSignal(signal).maybeSingle()),
      includeDynamicPricing ? checked(client.from('organization_dynamic_pricing')
        .select('id, organization_id, grade_min, grade_max, lessons_per_week, price')
        .eq('organization_id', organizationId).abortSignal(signal)) : [],
    ]);
    if (!org) throw new Error('Organization schedule settings are unavailable');
    const uniqueStudents = new Map<string, TStudent>();
    for (const row of [...(byTutor || []), ...(byOrg || [])] as TStudent[]) uniqueStudents.set(row.id, row);
    const rawTemplates = Array.isArray(org.org_subject_templates) ? org.org_subject_templates : [];
    return {
      orgTutors,
      subjects: (subjects || []) as TSubject[],
      students: [...uniqueStudents.values()],
      individualPricing: individualPricing || [],
      tutorSubjectPrices: tutorSubjectPrices || [],
      orgUsesLicenses: Number(org.tutor_license_count) > 0,
      orgSubjectTemplates: rawTemplates.filter((row): row is { id: string; name: string } =>
        Boolean(row && typeof row === 'object' && 'id' in row && 'name' in row
          && typeof row.id === 'string' && typeof row.name === 'string' && row.id && row.name),
      ).map(row => ({ id: row.id, name: String(row.name).trim() })),
      dynamicPricingRules: (dynamicRows || []).map(row => ({
        ...row, grade_min: Number(row.grade_min), grade_max: Number(row.grade_max),
        lessons_per_week: Number(row.lessons_per_week), price: Number(row.price),
      })),
    };
  });
}
