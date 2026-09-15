import { describe, expect, it } from 'vitest';
import {
  orgAdminShowsConvertToRecurringFields,
  orgAdminShowsCreateRecurrenceFields,
} from '@/lib/orgAdminRecurrenceUi';
import { MOKSLO_VAISIAI_ORG_ID, PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

describe('org admin recurrence UI', () => {
  it('keeps create-dialog recurrence for every org, including MV', () => {
    expect(orgAdminShowsCreateRecurrenceFields()).toBe(true);
  });

  it('limits convert-existing-lesson to Pro Klasė one-offs', () => {
    expect(orgAdminShowsConvertToRecurringFields({
      organizationId: PRO_KLASE_ORG_ID,
      isClassGroupSession: false,
      alreadyRecurring: false,
    })).toBe(true);
    expect(orgAdminShowsConvertToRecurringFields({
      organizationId: MOKSLO_VAISIAI_ORG_ID,
      isClassGroupSession: false,
      alreadyRecurring: false,
    })).toBe(false);
    expect(orgAdminShowsConvertToRecurringFields({
      organizationId: PRO_KLASE_ORG_ID,
      isClassGroupSession: true,
      alreadyRecurring: false,
    })).toBe(false);
    expect(orgAdminShowsConvertToRecurringFields({
      organizationId: PRO_KLASE_ORG_ID,
      isClassGroupSession: false,
      alreadyRecurring: true,
    })).toBe(false);
  });
});
