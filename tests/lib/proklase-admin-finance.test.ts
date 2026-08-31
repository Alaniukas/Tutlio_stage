import { describe, expect, it } from 'vitest';
import {
  packageClientPaidEur,
  proKlaseAccruedTutorCostEur,
  proKlaseAdminFinanceSplit,
  standaloneSessionClientPaidEur,
} from '../../src/lib/proKlaseAdminFinance';

const tutorRate = 15;

function paidLesson(overrides: Record<string, unknown> = {}) {
  return {
    status: 'active',
    payment_status: 'paid',
    paid: true,
    price: 25,
    is_complimentary: false,
    lesson_package_id: 'pkg-1',
    subjects: { is_trial: false },
    ...overrides,
  };
}

describe('proKlaseAdminFinance', () => {
  it('shows platform share immediately after package payment', () => {
    const sessions = Array.from({ length: 8 }, () => paidLesson());
    const split = proKlaseAdminFinanceSplit({
      clientPaidEur: 200,
      sessions,
      tutorPayRate: tutorRate,
    });
    expect(split.accruedTutorCostEur).toBe(120);
    expect(split.platformShareEur).toBe(80);
  });

  it('recalculates platform share when a paid lesson is cancelled', () => {
    const sessions = [
      ...Array.from({ length: 7 }, () => paidLesson()),
      paidLesson({ status: 'cancelled' }),
    ];
    const split = proKlaseAdminFinanceSplit({
      clientPaidEur: 200,
      sessions,
      tutorPayRate: tutorRate,
    });
    expect(split.accruedTutorCostEur).toBe(105);
    expect(split.platformShareEur).toBe(95);
  });

  it('accrues trial tutor pay before the lesson is marked completed', () => {
    expect(
      proKlaseAccruedTutorCostEur(
        paidLesson({ subjects: { is_trial: true }, price: 10 }),
        tutorRate,
      ),
    ).toBe(10);
  });

  it('counts package cash, not cancelled session prices, as client paid', () => {
    expect(packageClientPaidEur({ tutor_id: 't', total_price: 200, paid: true })).toBe(200);
    expect(
      standaloneSessionClientPaidEur(paidLesson({ lesson_package_id: 'pkg-1', status: 'cancelled' })),
    ).toBe(0);
  });
});
