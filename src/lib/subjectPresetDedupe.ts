/**
 * Same lesson offer for one tutor (name + duration + price).
 * Used to block duplicate rows regardless of colour / meeting link / grades.
 */
export function subjectTutorLessonKey(p: {
  name: string;
  duration_minutes: number;
  price: unknown;
}): string {
  return `${String(p.name).trim().toLowerCase()}|${Number(p.duration_minutes)}|${Number(p.price)}`;
}

export function tutorSubjectsContainLessonDuplicate<
  T extends { id?: string; name: string; duration_minutes: number; price: unknown },
>(
  rows: readonly T[],
  candidate: { name: string; duration_minutes: number; price: unknown },
  excludeId?: string
): boolean {
  const k = subjectTutorLessonKey(candidate);
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    if (subjectTutorLessonKey(row) === k) return true;
  }
  return false;
}

/**
 * Full-identity key for grouping org subject rows across tutors: identical
 * conditions (name, duration, price, colour, grades, group size) render as
 * ONE subject with tutor chips instead of a row per tutor.
 */
export function subjectGroupKey(p: {
  name: string;
  duration_minutes: number;
  price: unknown;
  color?: string | null;
  grade_min?: number | null;
  grade_max?: number | null;
  is_group?: boolean | null;
  max_students?: number | null;
}): string {
  const color = (p.color || '#6366f1').toLowerCase();
  const grades = `${p.grade_min ?? ''}-${p.grade_max ?? ''}`;
  const group = p.is_group ? `g${Number(p.max_students) || 0}` : 'i';
  return `${String(p.name).trim().toLowerCase()}|${Number(p.duration_minutes)}|${Number(p.price)}|${color}|${grades}|${group}`;
}

/** Canonical key for a subject (invitations, UI, DB) — colour always lowercase, numbers normalised. */

export function subjectPresetKey(p: {
  name: string;
  duration_minutes: number;
  price: number;
  color?: string | null;
}): string {
  const color = (p.color || '#6366f1').toLowerCase();
  return `${String(p.name).trim().toLowerCase()}|${Number(p.duration_minutes)}|${Number(p.price)}|${color}`;
}

export type LooseSubjectPreset = {
  name: string;
  duration_minutes?: number;
  price?: number;
  color?: string;
};

export function normalizeSubjectPreset(s: LooseSubjectPreset): {
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
} {
  return {
    name: String(s.name || '').trim(),
    duration_minutes: Number(s.duration_minutes) || 60,
    price: Number(s.price) || 0,
    color: (s.color || '#6366f1').toLowerCase(),
  };
}

/** Removes duplicates from array (same subject from template + DB catalogue etc.). */
export function dedupeSubjectPresets(presets: LooseSubjectPreset[] | null | undefined): LooseSubjectPreset[] {
  if (!presets?.length) return [];
  const seen = new Set<string>();
  const out: LooseSubjectPreset[] = [];
  for (const raw of presets) {
    const n = normalizeSubjectPreset(raw);
    const k = subjectPresetKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}
