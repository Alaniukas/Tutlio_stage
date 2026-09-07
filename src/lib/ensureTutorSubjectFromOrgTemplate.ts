import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgSubjectTemplateRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
  meeting_link?: string | null;
  is_group?: boolean;
  max_students?: number | null;
};

type TutorSubjectPriceRow = {
  tutor_id: string;
  org_subject_template_id: string;
  price: number;
  duration_minutes: number;
};

type SubjectRow = {
  id: string;
  name: string;
  tutor_id: string;
  duration_minutes: number;
  price: number;
  color: string;
  meeting_link?: string | null;
  is_group?: boolean | null;
  max_students?: number | null;
  is_trial?: boolean | null;
};

/**
 * Org tutors may only have org catalog templates until an admin books the first
 * lesson. Materialize a subjects row from the template (or reuse name match).
 */
export async function ensureTutorSubjectFromOrgTemplate(
  supabase: SupabaseClient,
  tutorId: string,
  template: OrgSubjectTemplateRow,
  tutorSubjectPrices: TutorSubjectPriceRow[] = [],
): Promise<SubjectRow> {
  const name = template.name.trim();
  if (!name) throw new Error('Subject name is required.');

  const { data: existingRows, error: lookupErr } = await supabase
    .from('subjects')
    .select('id, name, tutor_id, duration_minutes, price, color, meeting_link, is_group, max_students, is_trial')
    .eq('tutor_id', tutorId)
    .ilike('name', name);
  if (lookupErr) throw new Error(lookupErr.message);
  const existing = (existingRows || []).find(
    (row) => String((row as SubjectRow).name || '').trim().toLowerCase() === name.toLowerCase(),
  ) as SubjectRow | undefined;
  if (existing) return existing;

  const tsp = tutorSubjectPrices.find(
    (row) => row.tutor_id === tutorId && row.org_subject_template_id === template.id,
  );
  const price = tsp?.price ?? template.price ?? 0;
  const durationMinutes = tsp?.duration_minutes ?? template.duration_minutes ?? 60;

  const { data: created, error: insertErr } = await supabase
    .from('subjects')
    .insert({
      tutor_id: tutorId,
      name,
      duration_minutes: durationMinutes,
      price,
      color: template.color || '#6366f1',
      meeting_link: template.meeting_link || null,
      is_group: template.is_group || false,
      max_students: template.max_students ?? null,
    })
    .select('id, name, tutor_id, duration_minutes, price, color, meeting_link, is_group, max_students, is_trial')
    .single();

  if (insertErr || !created) {
    throw new Error(insertErr?.message || 'Failed to create subject for tutor.');
  }
  return created as SubjectRow;
}

export function parseOrgSubjectTemplates(raw: unknown): OrgSubjectTemplateRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === 'object' && (row as OrgSubjectTemplateRow).id && (row as OrgSubjectTemplateRow).name)
    .map((row) => {
      const tpl = row as OrgSubjectTemplateRow;
      return {
        id: String(tpl.id),
        name: String(tpl.name).trim(),
        duration_minutes: Number(tpl.duration_minutes) || 60,
        price: Number(tpl.price) || 0,
        color: tpl.color || '#6366f1',
        meeting_link: tpl.meeting_link ?? null,
        is_group: tpl.is_group ?? false,
        max_students: tpl.max_students ?? null,
      };
    });
}
