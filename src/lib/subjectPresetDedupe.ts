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
