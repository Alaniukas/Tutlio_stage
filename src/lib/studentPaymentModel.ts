export type PaymentModel = 'per_lesson' | 'monthly_billing' | 'prepaid_packages';
const PAYMENT_MODEL_VALUES: PaymentModel[] = ['per_lesson', 'monthly_billing', 'prepaid_packages'];

export function parseStudentPaymentModels(value: string | null | undefined): Set<PaymentModel> {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part): part is PaymentModel => PAYMENT_MODEL_VALUES.includes(part as PaymentModel)),
  );
}

export function serializeStudentPaymentModels(models: Iterable<PaymentModel>): string | null {
  const selectedSet = new Set(models);
  const normalized = PAYMENT_MODEL_VALUES.filter((m) => selectedSet.has(m));
  return normalized.length ? normalized.join(',') : null;
}

export function hasStudentPaymentModel(value: string | null | undefined, model: PaymentModel): boolean {
  return parseStudentPaymentModels(value).has(model);
}

export type LessonPaymentTiming = 'before_lesson' | 'after_lesson';

/** Effective before/after and deadline hours: per_lesson + non-NULL fields override tutor/org. */
export function resolvePerLessonPaymentRules(
  student: {
    payment_model?: string | null;
    per_lesson_payment_timing?: string | null;
    per_lesson_payment_deadline_hours?: number | null;
  },
  tutorDefaults: { payment_timing: string; payment_deadline_hours: number },
): { payment_timing: LessonPaymentTiming; payment_deadline_hours: number } {
  const timingOk = (v: string | null | undefined): v is LessonPaymentTiming =>
    v === 'before_lesson' || v === 'after_lesson';

  const base = {
    payment_timing: timingOk(tutorDefaults.payment_timing) ? tutorDefaults.payment_timing : 'before_lesson',
    payment_deadline_hours: Math.max(1, Number(tutorDefaults.payment_deadline_hours) || 24),
  } as const;

  if (!hasStudentPaymentModel(student.payment_model, 'per_lesson')) {
    return { payment_timing: base.payment_timing, payment_deadline_hours: base.payment_deadline_hours };
  }

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

/** Org row overrides profile fields (as in Finance / Calendar). */
export function mergeOrgTutorLessonPaymentDefaults(
  tutorProfile: {
    payment_timing?: string | null;
    payment_deadline_hours?: number | null;
    organization_id?: string | null;
  },
  orgRow: { payment_timing?: string | null; payment_deadline_hours?: number | null } | null | undefined,
): { payment_timing: LessonPaymentTiming; payment_deadline_hours: number } {
  const timingOk = (v: string | null | undefined): v is LessonPaymentTiming =>
    v === 'before_lesson' || v === 'after_lesson';

  let timing = (tutorProfile.payment_timing as string) || 'before_lesson';
  let hours = tutorProfile.payment_deadline_hours ?? 24;
  if (tutorProfile.organization_id && orgRow) {
    if (orgRow.payment_timing) timing = orgRow.payment_timing;
    if (orgRow.payment_deadline_hours != null) hours = orgRow.payment_deadline_hours;
  }
  return {
    payment_timing: timingOk(timing) ? timing : 'before_lesson',
    payment_deadline_hours: Math.max(1, Number(hours) || 24),
  };
}

export interface TutorPaymentFlags {
  enable_per_lesson: boolean;
  enable_monthly_billing: boolean;
  enable_prepaid_packages: boolean;
}

/** Whether per-student payment_model UI and semantics apply */
export function isPerStudentPaymentOverrideEnabled(
  orgFeatureEnabled: boolean,
  soloProfileFlag: boolean,
  hasOrganization: boolean,
): boolean {
  if (hasOrganization) return orgFeatureEnabled;
  return soloProfileFlag;
}

/**
 * Which tutor/org actions to show for package / monthly invoice, after student override.
 * When override is off or payment_model is null → tutor-level (or org) Finance flags apply.
 * When student has an explicit payment_model, that choice overrides org/tutor “enabled” flags
 * so the three variants remain usable independently of Company Finance toggles.
 */
export function getEffectivePaymentActions(
  tutorFlags: TutorPaymentFlags,
  studentPaymentModel: string | null | undefined,
  overrideEnabled: boolean,
): { canSendInvoice: boolean; canSendPackage: boolean } {
  const selectedModels = parseStudentPaymentModels(studentPaymentModel);
  if (!overrideEnabled || selectedModels.size === 0) {
    return {
      canSendInvoice: tutorFlags.enable_monthly_billing,
      canSendPackage: tutorFlags.enable_prepaid_packages,
    };
  }
  return {
    canSendInvoice: selectedModels.has('monthly_billing'),
    canSendPackage: selectedModels.has('prepaid_packages'),
  };
}

/** Student booking: use package credit only when model allows prepaid path */
export function shouldUsePackageForBooking(
  activePackage: { id: string } | null | undefined,
  studentPaymentModel: string | null | undefined,
  paymentOverrideActive: boolean,
): boolean {
  if (!activePackage) return false;
  const selectedModels = parseStudentPaymentModels(studentPaymentModel);
  if (!paymentOverrideActive || selectedModels.size === 0) return true;
  return selectedModels.has('prepaid_packages');
}
