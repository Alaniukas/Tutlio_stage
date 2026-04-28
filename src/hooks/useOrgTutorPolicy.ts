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
  invoiceIssuerMode: 'company' | 'tutor' | 'both';
  hasActiveLicense: boolean;
  orgUsesLicenses: boolean;
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
  invoiceIssuerMode: 'both',
  hasActiveLicense: true,
  orgUsesLicenses: false,
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

      let effectiveOrgId: string | null = profile?.organization_id ?? null;
      let effectiveCommissionPercent: number | null =
        profile && typeof (profile as any).company_commission_percent === 'number'
          ? Number((profile as any).company_commission_percent)
          : null;
      let effectiveHasActiveLicense: boolean | null =
        typeof (profile as any)?.has_active_license === 'boolean'
          ? Boolean((profile as any).has_active_license)
          : null;

      if (!effectiveOrgId && !userLoading) {
        const { data: ownProfile, error: ownProfileError } = await supabase
          .from('profiles')
          .select('organization_id, company_commission_percent, has_active_license')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (ownProfileError) {
          console.warn('[useOrgTutorPolicy] own profile fallback fetch:', ownProfileError.message);
        }
        effectiveOrgId = ownProfile?.organization_id ?? null;
        effectiveCommissionPercent =
          ownProfile && typeof ownProfile.company_commission_percent === 'number'
            ? Number(ownProfile.company_commission_percent)
            : effectiveCommissionPercent;
        effectiveHasActiveLicense =
          typeof ownProfile?.has_active_license === 'boolean'
            ? Boolean(ownProfile.has_active_license)
            : effectiveHasActiveLicense;
      }

      if (!effectiveOrgId) {
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
        .select('org_tutor_lesson_edit, org_tutors_can_edit_lesson_settings, invoice_issuer_mode, tutor_license_count')
        .eq('id', effectiveOrgId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('[useOrgTutorPolicy] org fetch:', error.message);
      }

      let prof: { company_commission_percent?: number | null; has_active_license?: boolean | null } | null = null;
      if (effectiveCommissionPercent == null || effectiveHasActiveLicense == null) {
        const { data: profData } = await supabase
          .from('profiles')
          .select('company_commission_percent, has_active_license')
          .eq('id', user.id)
          .maybeSingle();
        prof = profData as any;
      } else {
        prof = {
          company_commission_percent: effectiveCommissionPercent,
          has_active_license: effectiveHasActiveLicense,
        };
      }

      if (cancelled) return;

      const legacy = org?.org_tutors_can_edit_lesson_settings === true;
      const raw = org?.org_tutor_lesson_edit as Record<string, unknown> | null | undefined;
      const scope = parseOrgLessonEditScope(raw, legacy);
      const pay = Number(prof?.company_commission_percent) || 0;

      const issuerMode = (org?.invoice_issuer_mode as 'company' | 'tutor' | 'both') || 'both';
      const licenseCount = Number(org?.tutor_license_count) || 0;
      const orgUsesLicenses = licenseCount > 0;
      const hasActiveLicense = prof?.has_active_license !== false;

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
        invoiceIssuerMode: issuerMode,
        hasActiveLicense,
        orgUsesLicenses,
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.organization_id, profile?.id, userLoading]);

  return state;
}
