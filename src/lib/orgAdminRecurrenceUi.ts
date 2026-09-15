import { isProKlaseOrg } from '@/lib/marketMoney';

/**
 * Org calendar "create lesson" dialog: recurring controls are shared by every
 * company/school org (MV, Pro Klasė, others). Do not gate this on Pro Klasė —
 * that regression hid the toggle after the convert-to-series work.
 */
export function orgAdminShowsCreateRecurrenceFields(): boolean {
  return true;
}

/**
 * Turning an existing one-off into a series is the Pro Klasė-only editor extra.
 * New recurring schedules still go through the create dialog for every org.
 */
export function orgAdminShowsConvertToRecurringFields(input: {
  organizationId: string | null | undefined;
  isClassGroupSession: boolean;
  alreadyRecurring: boolean;
}): boolean {
  return (
    isProKlaseOrg(input.organizationId) &&
    !input.isClassGroupSession &&
    !input.alreadyRecurring
  );
}
