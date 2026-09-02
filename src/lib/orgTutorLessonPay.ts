/**
 * Org tutor pay per lesson is stored in profiles.company_commission_percent (EUR / lesson).
 * Per-subject overrides (profiles.company_commission_by_subject) apply only for
 * MB Mano korepetitorius. Pro Klasė keeps its own trial / no-show pay rules.
 */
import { isManoKorepetitoriusOrg } from '@/lib/marketMoney';

export function parseTutorPayBySubject(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(key).trim();
    const n = Number(value);
    if (!id || !Number.isFinite(n) || n <= 0) continue;
    out[id] = Math.round(n * 100) / 100;
  }
  return out;
}

export function compactTutorPayBySubject(
  input: Record<string, string | number | null | undefined>,
): Record<string, number> {
  return parseTutorPayBySubject(input);
}

export function orgTutorLessonPayEur(
  tutorPayRate: number | null | undefined,
  sessionPrice: number | null | undefined,
): number {
  const rate = Number(tutorPayRate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  const price = Number(sessionPrice);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function resolveOrgTutorLessonPayEur(opts: {
  defaultRate?: number | null;
  bySubject?: unknown;
  subjectId?: string | null;
  sessionPrice?: number | null;
}): number {
  const map = parseTutorPayBySubject(opts.bySubject);
  const subjectId = String(opts.subjectId || '').trim();
  if (subjectId && map[subjectId] != null) return map[subjectId];
  return orgTutorLessonPayEur(opts.defaultRate, opts.sessionPrice);
}

/** Apply subject rates only for Mano korepetitorius; everyone else uses the single default. */
export function orgTutorSessionPayEur(opts: {
  organizationId?: string | null;
  defaultRate?: number | null;
  bySubject?: unknown;
  subjectId?: string | null;
  sessionPrice?: number | null;
}): number {
  if (isManoKorepetitoriusOrg(opts.organizationId)) {
    return resolveOrgTutorLessonPayEur(opts);
  }
  return orgTutorLessonPayEur(opts.defaultRate, opts.sessionPrice);
}

export function sumOrgTutorLessonsPayEur(
  sessions: Array<{ subject_id?: string | null; price?: number | null }>,
  defaultRate: number | null | undefined,
  bySubject: unknown,
  organizationId?: string | null,
): number {
  return Math.round(
    sessions.reduce(
      (sum, session) =>
        sum +
        orgTutorSessionPayEur({
          organizationId,
          defaultRate,
          bySubject,
          subjectId: session.subject_id,
          sessionPrice: session.price,
        }),
      0,
    ) * 100,
  ) / 100;
}
