import { supabase } from '@/lib/supabase';
import { subjectPresetKey } from '@/lib/subjectPresetDedupe';

/** Removes org templates whose key matches an already-existing subject in DB (prevents template + tutor duplicates in Subject Management). */
export async function removeOrgSubjectTemplatesMatchingPreset(
  organizationId: string,
  preset: { name: string; duration_minutes: number; price: number; color: string }
): Promise<void> {
  const { data: row } = await supabase
    .from('organizations')
    .select('org_subject_templates')
    .eq('id', organizationId)
    .single();
  const raw = row?.org_subject_templates;
  const templates = Array.isArray(raw) ? (raw as { name: string; duration_minutes: number; price: number; color?: string }[]) : [];
  const key = subjectPresetKey(preset);
  const next = templates.filter(
    (t) =>
      subjectPresetKey({
        name: t.name,
        duration_minutes: t.duration_minutes,
        price: t.price,
        color: t.color || '#6366f1',
      }) !== key
  );
  if (next.length === templates.length) return;
  await supabase.from('organizations').update({ org_subject_templates: next }).eq('id', organizationId);
}
