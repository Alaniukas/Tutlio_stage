export type TutorDefaultPayRow = {
  id: string;
  company_commission_percent?: number | null;
};

/**
 * Tutors still using the previous organization default should follow a default
 * change. Explicit per-tutor rates must remain untouched.
 */
export function tutorIdsUsingPreviousDefaultPay(
  tutors: TutorDefaultPayRow[],
  previousDefaultPay: number,
): string[] {
  return tutors
    .filter((tutor) => {
      const current = tutor.company_commission_percent;
      if (current == null) return true;
      const numeric = Number(current);
      return Number.isFinite(numeric) && numeric === previousDefaultPay;
    })
    .map((tutor) => tutor.id);
}

/**
 * A cached form value must not overwrite a fresher database value unless the
 * administrator actually edited the default-pay field.
 */
export function resolveDefaultTutorPayForSave(
  formPay: number,
  persistedPay: number,
  wasEdited: boolean,
): number {
  return wasEdited ? formPay : persistedPay;
}
