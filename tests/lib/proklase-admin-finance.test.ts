import { describe, expect, it } from 'vitest';
import {
  packageClientPaidEur,
  proKlaseAccruedTutorCostEur,
  proKlaseAdminFinanceSplit,
  standaloneSessionClientPaidEur,
} from '../../src/lib/proKlaseAdminFinance';
import { orgFeeProfile } from '../../src/lib/marketMoney';

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

  it('does not treat Tutlio add-on (e.g. €0.40 on a €10 trial) as org company share', () => {
    const p = orgFeeProfile('proklase');
    expect(packageClientPaidEur({ tutor_id: 't', total_price: 10.4, price_per_lesson: 10, total_lessons: 1, paid: true }, p)).toBe(10);
    const split = proKlaseAdminFinanceSplit({
      clientPaidEur: packageClientPaidEur(
        { tutor_id: 't', total_price: 10.4, price_per_lesson: 10, total_lessons: 1, paid: true },
        p,
      ),
      sessions: [paidLesson({ subjects: { is_trial: true }, price: 10 })],
      tutorPayRate: tutorRate,
    });
    expect(split.clientPaidEur).toBe(10);
    expect(split.accruedTutorCostEur).toBe(10);
    expect(split.platformShareEur).toBe(0);
  });

  it('counts package cash, not cancelled session prices, as client paid', () => {
    expect(packageClientPaidEur({ tutor_id: 't', total_price: 200, paid: true })).toBe(200);
    expect(
      standaloneSessionClientPaidEur(paidLesson({ lesson_package_id: 'pkg-1', status: 'cancelled' })),
    ).toBe(0);
  });
});
