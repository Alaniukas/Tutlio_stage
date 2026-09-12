export type LessonDiscount = {
  percent: number;
  valid_from: string;
  valid_until?: string | null;
  tutor_id?: string | null;
  subject_id: string;
};

export function discountAppliesOnDate(
  discount: LessonDiscount,
  sessionDateYmd: string,
  tutorId?: string | null,
): boolean {
  if (discount.tutor_id && tutorId && discount.tutor_id !== tutorId) return false;
  if (sessionDateYmd < discount.valid_from) return false;
  if (discount.valid_until && sessionDateYmd > discount.valid_until) return false;
  return true;
}

export function discountedAmount(baseEur: number, percent: number): number {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const base = Math.max(0, Number(baseEur) || 0);
  return Math.round(base * (1 - p / 100) * 100) / 100;
}
