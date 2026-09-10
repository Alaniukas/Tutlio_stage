import type { SupabaseClient } from '@supabase/supabase-js';

type PaymentFlags = { enable_per_lesson?: boolean | null };

/** An explicit student choice wins; otherwise inherit the current billing owner's settings. */
export function allowsPerLessonBilling(model: string | null | undefined, flags: PaymentFlags): boolean {
  const models = String(model || '').split(',').map(value => value.trim()).filter(Boolean);
  return models.length > 0 ? models.includes('per_lesson') : flags.enable_per_lesson === true;
}

/** Never fall back to a stale tutor copy when an organization lookup fails. */
export async function loadPerLessonBillingFlags(
  supabase: SupabaseClient,
  tutor: PaymentFlags & { organization_id?: string | null },
): Promise<PaymentFlags> {
  if (!tutor.organization_id) return tutor;
  const { data, error } = await supabase.from('organizations').select('enable_per_lesson')
    .eq('id', tutor.organization_id).single();
  if (error || !data) throw new Error('Unable to load organization billing settings');
  return data;
}
