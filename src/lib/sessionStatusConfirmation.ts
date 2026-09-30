import { isLaisviVaikaiOrg, isProKlaseOrg } from './marketMoney.js';

/** Organizations whose lesson outcomes must be confirmed by a teacher or administrator. */
export function orgRequiresTutorStatusConfirmation(
  organizationId?: string | null,
  features?: Record<string, unknown> | null,
): boolean {
  return isLaisviVaikaiOrg(organizationId)
    || isProKlaseOrg(organizationId)
    || features?.tutor_lesson_status_confirmation === true;
}

/** Unstamped historical outcomes remain pending until someone explicitly confirms them. */
export function effectiveSessionOutcome(
  session: { status?: string | null; status_confirmed_at?: string | null },
  requireConfirmation: boolean,
): string {
  const status = session.status || 'active';
  return requireConfirmation && !session.status_confirmed_at && ['completed', 'no_show'].includes(status)
    ? 'active'
    : status;
}
