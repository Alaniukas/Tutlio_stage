import { describe, it, expect } from 'vitest';
import {
  isPackageReservationFlowEnabled,
  getPackagePaymentDeadlineHours,
  packagePaymentDeadlineIso,
  PACKAGE_PAYMENT_DEFAULT_DEADLINE_HOURS,
} from '../../api/_lib/trialReservation';
import { PRO_KLASE_QA_ORG_ID } from '../../api/_lib/marketMoney';

describe('isPackageReservationFlowEnabled', () => {
  it('is true only for a Pro Klasė company when the flag is exactly true', () => {
    expect(isPackageReservationFlowEnabled(
      { package_reservation_flow: true },
      PRO_KLASE_QA_ORG_ID,
      'company',
    )).toBe(true);
    expect(isPackageReservationFlowEnabled({ package_reservation_flow: true }, 'other-org', 'company')).toBe(false);
    expect(isPackageReservationFlowEnabled({ package_reservation_flow: true }, PRO_KLASE_QA_ORG_ID, 'school')).toBe(false);
  });

  it('is false for missing/falsy/non-object features', () => {
    expect(isPackageReservationFlowEnabled(null)).toBe(false);
    expect(isPackageReservationFlowEnabled(undefined)).toBe(false);
    expect(isPackageReservationFlowEnabled({})).toBe(false);
    expect(isPackageReservationFlowEnabled({ package_reservation_flow: false })).toBe(false);
    expect(isPackageReservationFlowEnabled({ package_reservation_flow: 'true' })).toBe(false);
  });
});

describe('getPackagePaymentDeadlineHours', () => {
  it('returns the configured hours when valid', () => {
    expect(getPackagePaymentDeadlineHours({ package_payment_deadline_hours: 48 })).toBe(48);
    expect(getPackagePaymentDeadlineHours({ package_payment_deadline_hours: '12' })).toBe(12);
  });

  it('falls back to the default for missing/invalid/out-of-range values', () => {
    expect(getPackagePaymentDeadlineHours({})).toBe(PACKAGE_PAYMENT_DEFAULT_DEADLINE_HOURS);
    expect(getPackagePaymentDeadlineHours({ package_payment_deadline_hours: 0 })).toBe(PACKAGE_PAYMENT_DEFAULT_DEADLINE_HOURS);
    expect(getPackagePaymentDeadlineHours({ package_payment_deadline_hours: -3 })).toBe(PACKAGE_PAYMENT_DEFAULT_DEADLINE_HOURS);
    expect(getPackagePaymentDeadlineHours({ package_payment_deadline_hours: 'x' })).toBe(PACKAGE_PAYMENT_DEFAULT_DEADLINE_HOURS);
  });
});

describe('packagePaymentDeadlineIso', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('is firstStart minus the configured hours', () => {
    expect(packagePaymentDeadlineIso('2026-06-10T12:00:00.000Z', 24, now)).toBe('2026-06-09T12:00:00.000Z');
  });

  it('clamps to now + 1h when the first lesson is too soon', () => {
    // First lesson in 2h, deadline 24h before would be in the past -> floor to now+1h.
    expect(packagePaymentDeadlineIso('2026-06-01T02:00:00.000Z', 24, now)).toBe('2026-06-01T01:00:00.000Z');
  });

  it('falls back to the floor for an invalid first-start', () => {
    expect(packagePaymentDeadlineIso('not-a-date', 24, now)).toBe('2026-06-01T01:00:00.000Z');
  });
});
