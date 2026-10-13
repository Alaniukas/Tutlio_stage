import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSubjectPreset, subjectTutorLessonKey } from '../../src/lib/subjectPresetDedupe.js';

/** Save invitation subjects before the invite is marked used, including on retries. */
export async function ensureTutorInviteSubjects(
  supabase: SupabaseClient,
  tutorId: string,
  presets: unknown,
): Promise<void> {
  if (!Array.isArray(presets) || presets.length === 0) return;

  const subjects = presets
    .filter((preset) => preset && typeof preset === 'object')
    .map((preset) => normalizeSubjectPreset({
      ...preset,
      name: String(preset.name || ''),
      color: String(preset.color || '#6366f1'),
    }))
    .filter((preset) => preset.name.length > 0);
  if (subjects.length === 0) return;

  const { data: existing, error: readError } = await supabase
    .from('subjects')
    .select('name, duration_minutes, price')
    .eq('tutor_id', tutorId);
  if (readError) throw readError;

  const taken = new Set((existing || []).map(subjectTutorLessonKey));
  const rows = subjects
    .filter((subject) => {
      const key = subjectTutorLessonKey(subject);
      if (taken.has(key)) return false;
      taken.add(key);
      return true;
    })
    .map((subject) => ({ tutor_id: tutorId, ...subject }));
  if (rows.length === 0) return;

  const { error: writeError } = await supabase.from('subjects').insert(rows);
  if (writeError) throw writeError;
}
