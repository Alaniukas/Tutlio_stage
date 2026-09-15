import { describe, expect, it } from 'vitest';
import {
  PRO_KLASE_TRIAL_PAY_EUR,
  proKlaseSessionPayEur,
} from '../../api/_lib/proKlaseTutorPay';

const confirmedAt = '2026-09-15T18:00:00.000Z';

describe('Pro Klasė server-side complimentary tutor pay', () => {
  it('pays the normal tutor rate for a regular complimentary lesson', () => {
    expect(proKlaseSessionPayEur({
      status: 'completed',
      is_complimentary: true,
      status_confirmed_at: confirmedAt,
    }, 15)).toBe(15);
  });

  it('keeps the fixed trial rate for a complimentary trial lesson', () => {
    expect(proKlaseSessionPayEur({
      status: 'completed',
      is_complimentary: true,
      subjects: { is_trial: true },
      status_confirmed_at: confirmedAt,
    }, 15)).toBe(PRO_KLASE_TRIAL_PAY_EUR);
  });
});
