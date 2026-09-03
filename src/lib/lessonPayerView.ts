import { normalizeEmail } from '@/lib/orgStudentTutorGuards';

export type LessonPaymentPayer = 'self' | 'parent' | string | null | undefined;

/** Same person listed as student and payer (case-insensitive). */
export function studentEmailMatchesPayer(
  studentEmail: string | null | undefined,
  payerEmail: string | null | undefined,
): boolean {
  const student = normalizeEmail(studentEmail);
  const payer = normalizeEmail(payerEmail);
  return Boolean(student && payer && student === payer);
}

/**
 * Show lesson price / pending-paid amounts in the student portal.
 * Parent payer with a different email does not see amounts here.
 */
export function viewerSeesLessonPaymentAmounts(
  paymentPayer: LessonPaymentPayer,
  viewerEmail: string | null | undefined,
  studentEmail: string | null | undefined,
  payerEmail: string | null | undefined,
): boolean {
  if (paymentPayer !== 'parent') return true;
  return (
    studentEmailMatchesPayer(studentEmail, payerEmail) &&
    studentEmailMatchesPayer(viewerEmail, payerEmail)
  );
}

/**
 * Student portal may open Stripe / Perlas checkout for this student row.
 * Requires known payer role; blocks parent-payer when viewer is not the payer email.
 */
export function viewerCanPayLessons(
  paymentPayer: LessonPaymentPayer,
  viewerEmail: string | null | undefined,
  studentEmail: string | null | undefined,
  payerEmail: string | null | undefined,
): boolean {
  if (paymentPayer == null || paymentPayer === '') return false;
  if (paymentPayer !== 'parent') return true;
  return (
    studentEmailMatchesPayer(studentEmail, payerEmail) &&
    studentEmailMatchesPayer(viewerEmail, payerEmail)
  );
}
