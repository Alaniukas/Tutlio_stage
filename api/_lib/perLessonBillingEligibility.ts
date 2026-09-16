import type { SupabaseClient } from '@supabase/supabase-js';

export type PaymentFlags = {
  enable_per_lesson?: boolean | null;
  enable_monthly_billing?: boolean | null;
};

type BillingOwner = PaymentFlags & { organization_id?: string | null };

export type OrganizationPaymentFlagsById = ReadonlyMap<string, PaymentFlags>;

/** An explicit student choice wins; otherwise inherit the current billing owner's settings. */
export function allowsPerLessonBilling(model: string | null | undefined, flags: PaymentFlags): boolean {
  const models = String(model || '').split(',').map(value => value.trim()).filter(Boolean);
  return models.length > 0
    ? models.includes('per_lesson')
    : flags.enable_per_lesson === true && flags.enable_monthly_billing !== true;
}

/**
 * Resolve the current billing owner without trusting a tutor profile copy for
 * organization tutors. A missing organization row fails closed so a transient
 * lookup problem can never produce a per-lesson charge or reminder.
 */
export function allowsPerLessonBillingForOwner(
  model: string | null | undefined,
  tutor: BillingOwner,
  organizationFlagsById: OrganizationPaymentFlagsById,
): boolean {
  const organizationId = String(tutor.organization_id || '').trim();
  const flags = organizationId ? organizationFlagsById.get(organizationId) : tutor;
  return allowsPerLessonBilling(model, flags || {});
}

/** Never fall back to a stale tutor copy when an organization lookup fails. */
export async function loadPerLessonBillingFlags(
  supabase: SupabaseClient,
  tutor: BillingOwner,
): Promise<PaymentFlags> {
  if (!tutor.organization_id) return tutor;
  const { data, error } = await supabase.from('organizations')
    .select('enable_per_lesson, enable_monthly_billing')
    .eq('id', tutor.organization_id).single();
  if (error || !data) throw new Error('Unable to load organization billing settings');
  return data;
}
