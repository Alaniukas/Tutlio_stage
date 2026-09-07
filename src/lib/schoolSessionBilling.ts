/** School org sessions billed monthly (installments / school_monthly_invoices), not per lesson. */

export type SchoolSessionBillingInput = {
  class_group_id?: string | null;
  school_billing_kind?: string | null;
  price?: number | null;
};

export function isSchoolBilledSession(session: SchoolSessionBillingInput): boolean {
  if (session.class_group_id) return true;
  const kind = String(session.school_billing_kind || '').trim();
  return kind === 'base' || kind === 'extra';
}

export function shouldSkipPerLessonPaymentReminders(
  session: SchoolSessionBillingInput,
  orgEntityType?: string | null,
): boolean {
  if (String(orgEntityType || '').trim().toLowerCase() === 'school') return true;
  return isSchoolBilledSession(session);
}

export function shouldShowPerLessonPaymentUi(
  session: SchoolSessionBillingInput,
  orgEntityType?: string | null,
): boolean {
  return !shouldSkipPerLessonPaymentReminders(session, orgEntityType);
}
