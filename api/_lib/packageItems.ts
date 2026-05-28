/**
 * Multi-subject lesson package helpers.
 *
 * A lesson package is composed of one or more "items" — each item is a
 * (subject, lesson count, price-per-lesson) tuple. This file normalizes the
 * various request shapes (legacy single-subject, new items[]) into a single
 * canonical list and provides helpers used by the package creation, payment,
 * and email flows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RawItemInput = {
  subjectId?: string | null;
  totalLessons?: number | null;
  pricePerLesson?: number | null;
};

export type NormalizedPackageItem = {
  subjectId: string;
  totalLessons: number;
  /** Optional price override from the caller. Resolution against student / subject defaults happens later. */
  pricePerLessonOverride: number | null;
};

export type ResolvedPackageItem = {
  subjectId: string;
  subjectName: string;
  totalLessons: number;
  pricePerLesson: number;
  itemTotalPrice: number;
};

/**
 * Accept the new `items: [...]` payload and the legacy
 * `{ subjectId, totalLessons, pricePerLesson }` shape, returning a single
 * normalized array.
 */
export function normalizePackageItemsInput(body: {
  items?: unknown;
  subjectId?: unknown;
  totalLessons?: unknown;
  pricePerLesson?: unknown;
}): { items: NormalizedPackageItem[]; error: string | null } {
  const rawItems: RawItemInput[] = Array.isArray(body.items)
    ? (body.items as RawItemInput[])
    : (typeof body.subjectId === 'string' && body.subjectId.length > 0)
      ? [{
        subjectId: body.subjectId as string,
        totalLessons: typeof body.totalLessons === 'number' ? body.totalLessons : null,
        pricePerLesson: typeof body.pricePerLesson === 'number' ? body.pricePerLesson : null,
      }]
      : [];

  if (rawItems.length === 0) {
    return { items: [], error: 'Pakete turi būti bent vienas dalykas.' };
  }

  const seenSubjects = new Set<string>();
  const out: NormalizedPackageItem[] = [];
  for (const raw of rawItems) {
    const sid = typeof raw.subjectId === 'string' ? raw.subjectId.trim() : '';
    const qty = typeof raw.totalLessons === 'number' && Number.isFinite(raw.totalLessons) ? Math.floor(raw.totalLessons) : 0;
    if (!sid) return { items: [], error: 'Trūksta dalyko ID viename iš paketo punktų.' };
    if (qty <= 0) return { items: [], error: 'Kiekvienam dalykui kiekis turi būti didesnis už 0.' };
    if (seenSubjects.has(sid)) return { items: [], error: 'Tas pats dalykas neturi būti pakete du kartus.' };
    seenSubjects.add(sid);

    const overrideRaw = raw.pricePerLesson;
    const override =
      typeof overrideRaw === 'number' && Number.isFinite(overrideRaw) && overrideRaw >= 0
        ? overrideRaw
        : null;

    out.push({ subjectId: sid, totalLessons: qty, pricePerLessonOverride: override });
  }

  const totalLessons = out.reduce((acc, it) => acc + it.totalLessons, 0);
  if (totalLessons <= 0 || totalLessons > 100) {
    return { items: [], error: 'Visų dalykų pamokų skaičius pakete turi būti 1–100.' };
  }

  return { items: out, error: null };
}

/**
 * Look up every item's subject (tutor ownership + default price) and the
 * student's per-subject pricing override, then return a fully-resolved item
 * list ready to insert into `lesson_package_items` and to render as Stripe
 * line items.
 */
export async function resolvePackageItems(
  supabase: SupabaseClient,
  args: {
    tutorId: string;
    studentId: string;
    items: NormalizedPackageItem[];
    /** Default fallback when neither override nor student pricing nor subject price is set. */
    defaultPriceEur?: number;
  },
): Promise<{ items: ResolvedPackageItem[]; error: string | null }> {
  const { tutorId, studentId, items, defaultPriceEur = 25 } = args;
  const subjectIds = items.map((i) => i.subjectId);

  const [subjectsRes, pricingRes] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name, price, tutor_id')
      .in('id', subjectIds),
    supabase
      .from('student_individual_pricing')
      .select('subject_id, price')
      .eq('student_id', studentId)
      .eq('tutor_id', tutorId)
      .in('subject_id', subjectIds),
  ]);

  if (subjectsRes.error) return { items: [], error: subjectsRes.error.message };

  const subjectById = new Map<string, { id: string; name: string; price: number | null; tutor_id: string }>();
  for (const s of subjectsRes.data ?? []) {
    subjectById.set((s as { id: string }).id, s as any);
  }

  const studentPriceBySubject = new Map<string, number>();
  for (const p of pricingRes.data ?? []) {
    const row = p as { subject_id: string; price: number | string };
    const n = Number(row.price);
    if (Number.isFinite(n)) studentPriceBySubject.set(row.subject_id, n);
  }

  const resolved: ResolvedPackageItem[] = [];
  for (const it of items) {
    const subj = subjectById.get(it.subjectId);
    if (!subj) return { items: [], error: `Dalykas nerastas (${it.subjectId}).` };
    if (subj.tutor_id !== tutorId) {
      return { items: [], error: `Dalykas nepriklauso šiam korepetitoriui (${it.subjectId}).` };
    }
    const price =
      it.pricePerLessonOverride !== null
        ? it.pricePerLessonOverride
        : studentPriceBySubject.has(it.subjectId)
          ? Number(studentPriceBySubject.get(it.subjectId))
          : subj.price !== null && subj.price !== undefined
            ? Number(subj.price)
            : defaultPriceEur;
    if (!Number.isFinite(price) || price < 0) {
      return { items: [], error: `Netinkama kaina dalykui ${subj.name}.` };
    }
    resolved.push({
      subjectId: it.subjectId,
      subjectName: subj.name || 'Pamoka',
      totalLessons: it.totalLessons,
      pricePerLesson: Number(price),
      itemTotalPrice: Number((Number(price) * it.totalLessons).toFixed(2)),
    });
  }

  return { items: resolved, error: null };
}

/** Sum totals across items (totalLessons sum and grand total EUR). */
export function aggregatePackageTotals(items: ResolvedPackageItem[]): {
  totalLessons: number;
  totalPriceEur: number;
} {
  const totalLessons = items.reduce((acc, it) => acc + it.totalLessons, 0);
  const totalPriceEur = Number(
    items.reduce((acc, it) => acc + it.itemTotalPrice, 0).toFixed(2),
  );
  return { totalLessons, totalPriceEur };
}

/** Email payload helper: items list each renderable row needs. */
export function itemsForEmailPayload(items: ResolvedPackageItem[]): Array<{
  subjectName: string;
  totalLessons: number;
  pricePerLesson: string;
  itemTotal: string;
}> {
  return items.map((it) => ({
    subjectName: it.subjectName,
    totalLessons: it.totalLessons,
    pricePerLesson: it.pricePerLesson.toFixed(2),
    itemTotal: it.itemTotalPrice.toFixed(2),
  }));
}
