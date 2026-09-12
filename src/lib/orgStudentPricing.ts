import type { SupabaseClient } from '@supabase/supabase-js';
import { sameOrgStudentIdentity, type OrgStudentIdentityRow } from './orgStudentIdentity.js';
import { findOrganizationDynamicPrice, parseStudentGrade, type DynamicPricingStudent } from './organizationDynamicPricing.js';
import { isProKlaseOrg } from './marketMoney.js';

export type PricingIdentityStudent = OrgStudentIdentityRow & DynamicPricingStudent & {
  detached_at?: string | null;
  pricing_lessons_per_week_is_manual?: boolean | null;
};
export type PricingRecurringRow = { id: string; student_id: string; active: boolean; end_date?: string | null; frequency?: string | null };

/** Frequency is a contract property, never the number of credits in a package. */
export function orgIdentityPricingFrequency(
  student: PricingIdentityStudent,
  rows: PricingIdentityStudent[],
  recurring: PricingRecurringRow[],
  today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
): number | null {
  const identity = rows.filter(row => !row.detached_at &&
    row.organization_id === student.organization_id &&
    (isProKlaseOrg(student.organization_id) ? sameOrgStudentIdentity(student, row) : row.id === student.id));
  const manual = [...new Set(identity.filter(row => row.pricing_lessons_per_week_is_manual)
    .map(row => row.pricing_lessons_per_week).filter((n): n is number => Number.isInteger(n) && Number(n) > 0))];
  if (manual.length > 1) throw new Error('Conflicting manual pricing frequencies for the same student.');
  if (manual.length === 1) return manual[0];
  const ids = new Set(identity.map(row => row.id));
  // Preserve contracted-slot semantics: biweekly/monthly templates each count
  // once, as in the existing database trigger; do not derive package quantities.
  const count = new Set(recurring.filter(row => row.active && ids.has(row.student_id) &&
    (!row.end_date || row.end_date >= today)).map(row => row.id)).size;
  return count || null;
}

/** Read fresh identity-wide schedule and rates at creation, instead of cached row prices. */
export async function fetchOrgStudentDynamicPrice(supabase: SupabaseClient, studentId: string): Promise<{
  price: number | null; lessonsPerWeek: number | null; studentIds: string[];
}> {
  const fields = 'id, organization_id, linked_user_id, full_name, email, grade, detached_at, pricing_lessons_per_week, pricing_lessons_per_week_is_manual';
  const { data: student, error } = await supabase.from('students').select(fields).eq('id', studentId).single();
  if (error) throw new Error(error.message);
  if (!student.organization_id) return { price: null, lessonsPerWeek: null, studentIds: [studentId] };
  const [rows, rules] = await Promise.all([
    supabase.from('students').select(fields).eq('organization_id', student.organization_id).is('detached_at', null),
    supabase.from('organization_dynamic_pricing').select('grade_min, grade_max, lessons_per_week, price').eq('organization_id', student.organization_id),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  if (rules.error) throw new Error(rules.error.message);
  const identity = (rows.data || []).filter(row => isProKlaseOrg(student.organization_id)
    ? sameOrgStudentIdentity(student, row) : row.id === student.id);
  const studentIds = identity.map(row => row.id);
  if (!studentIds.length) return { price: null, lessonsPerWeek: null, studentIds };
  const recurring = await supabase.from('recurring_individual_sessions').select('id, student_id, active, end_date, frequency').in('student_id', studentIds).eq('active', true);
  if (recurring.error) throw new Error(recurring.error.message);
  const lessonsPerWeek = orgIdentityPricingFrequency(student, identity, recurring.data || []);
  const grades = [...new Set(identity.map(row => parseStudentGrade(row.grade)).filter((grade): grade is number => grade !== null))];
  if (grades.length > 1) throw new Error('Conflicting grades for the same student pricing identity.');
  const grade = grades.length === 1 ? String(grades[0]) : null;
  return {
    price: findOrganizationDynamicPrice(rules.data || [], { grade, pricing_lessons_per_week: lessonsPerWeek }, lessonsPerWeek),
    lessonsPerWeek, studentIds,
  };
}
