import { supabase } from '@/lib/supabase';
import { isWaitlistHiddenForOrg } from '@/lib/marketMoney';
import { proKlaseFeatureEnabledForOrgRecord } from '@/lib/orgIntakeMode';

/**
 * Org feature `disable_student_booking`: self-booking is turned off for the
 * student's organization (lessons are created only by the org admin/tutor).
 *
 * Students/parents carry no organization_id on their own auth profile, so the
 * org is resolved from the student row, falling back to the tutor's profile.
 * Lookups fail open (booking UI stays visible) — the sessions INSERT policy
 * enforces the flag server-side regardless.
 */
export interface StudentPortalPolicyEntry {
  organizationId: string | null;
  /** Org feature disable_student_booking. */
  bookingDisabled: boolean;
  /** Org feature disable_student_reschedule_cancel. */
  actionsDisabled: boolean;
  /** Org feature student_payments_page ("Mokėjimai" portal section). */
  paymentsPageEnabled: boolean;
  /** Waitlist fully disabled for this org (Pro Klasė / disable_waitlist). */
  waitlistHidden: boolean;
}

/**
 * One lookup for every portal-gating org flag of the given students. Fails
 * open (all false) — RLS is the enforcement layer.
 */
export async function fetchStudentPortalPolicyMap(
  studentIds: Array<string | null | undefined>,
): Promise<Record<string, StudentPortalPolicyEntry>> {
  const ids = [...new Set(studentIds.filter((id): id is string => !!id))];
  const result: Record<string, StudentPortalPolicyEntry> = {};
  if (ids.length === 0) return result;
  const fallback = (): StudentPortalPolicyEntry => ({
    organizationId: null,
    bookingDisabled: false,
    actionsDisabled: false,
    paymentsPageEnabled: false,
    waitlistHidden: false,
  });
  try {
    const { data: rows } = await supabase
      .from('students')
      .select('id, organization_id, tutor_id')
      .in('id', ids);
    const students = (rows ?? []) as Array<{
      id: string;
      organization_id: string | null;
      tutor_id: string | null;
    }>;

    const tutorIds = [
      ...new Set(
        students
          .filter((s) => !s.organization_id && s.tutor_id)
          .map((s) => s.tutor_id as string),
      ),
    ];
    const tutorOrg: Record<string, string | null> = {};
    if (tutorIds.length > 0) {
      const { data: tps } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .in('id', tutorIds);
      for (const tp of (tps ?? []) as Array<{ id: string; organization_id: string | null }>) {
        tutorOrg[tp.id] = tp.organization_id;
      }
    }

    const orgOfStudent: Record<string, string | null> = {};
    for (const s of students) {
      orgOfStudent[s.id] = s.organization_id ?? (s.tutor_id ? tutorOrg[s.tutor_id] ?? null : null);
    }

    const orgIds = [...new Set(Object.values(orgOfStudent).filter((v): v is string => !!v))];
    const policyByOrg: Record<
      string,
      { bookingDisabled: boolean; actionsDisabled: boolean; paymentsPageEnabled: boolean; waitlistHidden: boolean }
    > = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, features, entity_type')
        .in('id', orgIds);
      for (const o of (orgs ?? []) as Array<{ id: string; features: Record<string, unknown> | null; entity_type?: string | null }>) {
        const bookingDisabled = o.features?.disable_student_booking === true;
        const waitlistHidden =
          o.features?.disable_waitlist === true ||
          isWaitlistHiddenForOrg(o.id) ||
          bookingDisabled;
        policyByOrg[o.id] = {
          bookingDisabled,
          actionsDisabled: o.features?.disable_student_reschedule_cancel === true,
          paymentsPageEnabled: proKlaseFeatureEnabledForOrgRecord(
            o.id,
            o.entity_type,
            o.features,
            'student_payments_page',
          ),
          waitlistHidden,
        };
      }
    }

    for (const id of ids) {
      const orgId = orgOfStudent[id];
      const policy = orgId ? policyByOrg[orgId] : undefined;
      result[id] = {
        organizationId: orgId ?? null,
        bookingDisabled: policy?.bookingDisabled === true,
        actionsDisabled: policy?.actionsDisabled === true,
        paymentsPageEnabled: policy?.paymentsPageEnabled === true,
        waitlistHidden:
          policy?.waitlistHidden === true || isWaitlistHiddenForOrg(orgId),
      };
    }
  } catch {
    // fail open — see doc comment
    for (const id of ids) {
      if (!result[id]) result[id] = fallback();
    }
  }
  for (const id of ids) {
    if (!result[id]) result[id] = fallback();
  }
  return result;
}

export async function fetchSelfBookingDisabledMap(
  studentIds: Array<string | null | undefined>,
): Promise<Record<string, boolean>> {
  const map = await fetchStudentPortalPolicyMap(studentIds);
  const result: Record<string, boolean> = {};
  for (const [id, entry] of Object.entries(map)) {
    result[id] = entry.bookingDisabled;
  }
  return result;
}

export async function isSelfBookingDisabledForStudent(
  studentId: string | null | undefined,
): Promise<boolean> {
  if (!studentId) return false;
  const map = await fetchSelfBookingDisabledMap([studentId]);
  return map[studentId] === true;
}
