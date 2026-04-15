import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { parseOrgLessonEditScope, anyOrgLessonEdit, type OrgLessonEditScope } from '@/lib/orgTutorLessonEdit';

export type { OrgLessonEditScope };

export interface OrgTutorPolicy {
  loading: boolean;
  isOrgTutor: boolean;
  /** @deprecated naudokite editSubjects / editPricing */
  orgTutorsCanEditLessonSettings: boolean;
  editSubjects: boolean;
  editPricing: boolean;
  editCancellation: boolean;
  editBreakBetweenLessons: boolean;
  editMinBookingHours: boolean;
  editReminders: boolean;
  payPerLessonEur: number;
  hideMoney: boolean;
  canEditLessonPricing: boolean;
  canToggleSessionPaid: boolean;
}

const defaultPolicy: OrgTutorPolicy = {
  loading: true,
  isOrgTutor: false,
  orgTutorsCanEditLessonSettings: false,
  editSubjects: false,
  editPricing: false,
  editCancellation: false,
  editBreakBetweenLessons: false,
  editMinBookingHours: false,
  editReminders: false,
  payPerLessonEur: 0,
  hideMoney: false,
  canEditLessonPricing: true,
  canToggleSessionPaid: true,
};

export function useOrgTutorPolicy(): OrgTutorPolicy {
  const { user, profile, loading: userLoading } = useUser();
  const [state, setState] = useState<OrgTutorPolicy>(defaultPolicy);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user) {
        setState({ ...defaultPolicy, loading: false });
        return;
      }

      if (!profile) {
        if (!userLoading) {
          setState({ ...defaultPolicy, loading: false, isOrgTutor: false });
        }
        return;
      }

      if (!profile.organization_id) {
        setState({
          ...defaultPolicy,
          loading: false,
          isOrgTutor: false,
        });
        return;
      }

      setState({
        ...defaultPolicy,
        loading: true,
        isOrgTutor: true,
        orgTutorsCanEditLessonSettings: false,
        editSubjects: false,
        editPricing: false,
        editCancellation: false,
        editBreakBetweenLessons: false,
        editMinBookingHours: false,
        editReminders: false,
        hideMoney: true,
        canEditLessonPricing: false,
        canToggleSessionPaid: false,
      });

      const { data: org, error } = await supabase
        .from('organizations')
        .select('org_tutor_lesson_edit, org_tutors_can_edit_lesson_settings')
        .eq('id', profile.organization_id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('[useOrgTutorPolicy] org fetch:', error.message);
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('company_commission_percent')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const legacy = org?.org_tutors_can_edit_lesson_settings === true;
      const raw = org?.org_tutor_lesson_edit as Record<string, unknown> | null | undefined;
      const scope = parseOrgLessonEditScope(raw, legacy);
      const pay = Number(prof?.company_commission_percent) || 0;

      setState({
        loading: false,
        isOrgTutor: true,
        orgTutorsCanEditLessonSettings: scope.subjects || scope.pricing,
        editSubjects: scope.subjects,
        editPricing: scope.pricing,
        editCancellation: scope.cancellation,
        editBreakBetweenLessons: scope.break_between_lessons,
        editMinBookingHours: scope.min_booking_hours,
        editReminders: scope.reminders,
        payPerLessonEur: pay,
        hideMoney: true,
        canEditLessonPricing: anyOrgLessonEdit(scope),
        canToggleSessionPaid: false,
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.organization_id, profile?.id, userLoading]);

  return state;
}
