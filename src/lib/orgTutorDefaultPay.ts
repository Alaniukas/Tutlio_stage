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

export type TutorPayUpdatePatch = {
  company_commission_percent?: number;
  company_commission_by_subject?: Record<string, number>;
};

/**
 * A tutor profile contains many unrelated settings. Pay fields are financially
 * sensitive, so a generic profile save must only include the pay values the
 * administrator explicitly edited in this editor session.
 */
export function buildTutorPayUpdatePatch(options: {
  basePayEdited: boolean;
  basePay: number;
  subjectPayEdited: boolean;
  subjectPay: Record<string, number>;
  subjectPayEnabled: boolean;
}): TutorPayUpdatePatch {
  return {
    ...(options.basePayEdited
      ? { company_commission_percent: options.basePay }
      : {}),
    ...(options.subjectPayEnabled && options.subjectPayEdited
      ? { company_commission_by_subject: options.subjectPay }
      : {}),
  };
}
