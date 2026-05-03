import { supabase } from '@/lib/supabase';
import { normalizeSubjectPreset, subjectTutorLessonKey, type LooseSubjectPreset } from '@/lib/subjectPresetDedupe';

export type TutorSubjectPreset = LooseSubjectPreset;

/**
 * Inserts invitation presets when that tutor does not already have the same lesson
 * (name + duration + price). Colour is ignored so org/admin and invite cannot duplicate the same slot.
 */
export async function ensureTutorPresetSubjects(
  tutorId: string,
  presets: TutorSubjectPreset[] | null | undefined
): Promise<void> {
  if (!presets || !Array.isArray(presets) || presets.length === 0) return;

  const { data: existing } = await supabase
    .from('subjects')
    .select('name, duration_minutes, price')
    .eq('tutor_id', tutorId);

  const taken = new Set(
    (existing || []).map((r: { name: string; duration_minutes: number; price: unknown }) =>
      subjectTutorLessonKey({
        name: r.name,
        duration_minutes: r.duration_minutes,
        price: r.price,
      })
    )
  );

  type Row = { tutor_id: string; name: string; duration_minutes: number; price: number; color: string };
  const rows: Row[] = [];
  for (const s of presets) {
    const n = normalizeSubjectPreset(s);
    const row: Row = { tutor_id: tutorId, ...n };
    const lk = subjectTutorLessonKey(row);
    if (taken.has(lk)) continue;
    taken.add(lk);
    rows.push(row);
  }

  if (rows.length === 0) return;

  await supabase.from('subjects').insert(rows);
}
