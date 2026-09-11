import { describe, expect, it } from 'vitest';
import {
  cannotExceedIndividualUs,
  computeUsBalance,
  groupUsChargeMinutes,
} from '@/lib/schoolConsultationBalance';

describe('schoolConsultationBalance', () => {
  it('sums charged and reserved minutes', () => {
    const balance = computeUsBalance({
      annualLimit: 1920,
      consultations: [
        { status: 'occurred', outcome: 'occurred', mode: 'individual', planned_minutes: 45, charged_minutes: 45 },
        { status: 'confirmed', mode: 'individual', planned_minutes: 30, start_time: '2099-01-01T10:00:00Z' },
      ],
    });
    expect(balance.usedMinutes).toBe(45);
    expect(balance.reservedMinutes).toBe(30);
    expect(balance.remainingMinutes).toBe(1845);
  });

  it('blocks individual when over remaining', () => {
    expect(cannotExceedIndividualUs(20, 45, 'individual')).toBe(true);
    expect(cannotExceedIndividualUs(20, 45, 'group')).toBe(false);
  });

  it('caps group charge at remaining', () => {
    expect(groupUsChargeMinutes(20, 45)).toBe(20);
  });
});
