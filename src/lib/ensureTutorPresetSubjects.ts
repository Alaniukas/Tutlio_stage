import { supabase } from '@/lib/supabase';
import { normalizeSubjectPreset, subjectPresetKey, type LooseSubjectPreset } from '@/lib/subjectPresetDedupe';

export type TutorSubjectPreset = LooseSubjectPreset;

/**
 * Inserts invitation subjects only if the same one does not already exist (guards against duplicate invitation
 * processing and different colour formats like #fff vs #FFF).
 */
export async function ensureTutorPresetSubjects(
  tutorId: string,
  presets: TutorSubjectPreset[] | null | undefined
): Promise<void> {
  if (!presets || !Array.isArray(presets) || presets.length === 0) return;

  const { data: existing } = await supabase
    .from('subjects')
    .select('name, duration_minutes, price, color')
    .eq('tutor_id', tutorId);

  const have = new Set(
    (existing || []).map((r: { name: string; duration_minutes: number; price: unknown; color: string | null }) =>
      subjectPresetKey({
        name: r.name,
        duration_minutes: r.duration_minutes,
        price: Number(r.price),
        color: r.color,
      })
    )
  );

  const rows = presets
    .map((s) => {
      const n = normalizeSubjectPreset(s);
      return { tutor_id: tutorId, ...n };
    })
    .filter((r) => {
      const k = subjectPresetKey(r);
      if (have.has(k)) return false;
      have.add(k);
      return true;
    });

  if (rows.length === 0) return;

  await supabase.from('subjects').insert(rows);
}
