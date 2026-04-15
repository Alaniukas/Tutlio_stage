export type PaymentTiming = 'before_lesson' | 'after_lesson';

export function resolvePerLessonPaymentRules(
  student: {
    payment_model?: string | null;
    per_lesson_payment_timing?: string | null;
    per_lesson_payment_deadline_hours?: number | null;
  },
  tutorDefaults: { payment_timing: string; payment_deadline_hours: number },
): { payment_timing: PaymentTiming; payment_deadline_hours: number } {
  const timingOk = (v: string | null | undefined): v is PaymentTiming =>
    v === 'before_lesson' || v === 'after_lesson';

  const base: { payment_timing: PaymentTiming; payment_deadline_hours: number } = {
    payment_timing: timingOk(tutorDefaults.payment_timing) ? tutorDefaults.payment_timing : 'before_lesson',
    payment_deadline_hours: Math.max(1, Number(tutorDefaults.payment_deadline_hours) || 24),
  };

  if (student.payment_model !== 'per_lesson') return base;

  return {
    payment_timing: timingOk(student.per_lesson_payment_timing)
      ? student.per_lesson_payment_timing
      : base.payment_timing,
    payment_deadline_hours:
      student.per_lesson_payment_deadline_hours != null
        ? Math.max(1, Number(student.per_lesson_payment_deadline_hours))
        : base.payment_deadline_hours,
  };
}
