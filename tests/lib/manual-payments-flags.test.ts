import { describe, it, expect } from 'vitest';

function resolveManualPayments(features: Record<string, unknown> | null | undefined): boolean {
  const f = features || {};
  // Mirrors the fallback logic we use in AdminPanel/useOrgFeatures/CompanySettings:
  // prefer manual_payments, but accept legacy enable_manual_student_payments.
  const direct = f.manual_payments;
  if (typeof direct === 'boolean') return direct;
  return f.enable_manual_student_payments === true;
}

describe('manual payments feature flags', () => {
  it('prefers manual_payments when present', () => {
    expect(resolveManualPayments({ manual_payments: true, enable_manual_student_payments: false })).toBe(true);
    expect(resolveManualPayments({ manual_payments: false, enable_manual_student_payments: true })).toBe(false);
  });

  it('falls back to legacy enable_manual_student_payments', () => {
    expect(resolveManualPayments({ enable_manual_student_payments: true })).toBe(true);
    expect(resolveManualPayments({ enable_manual_student_payments: false })).toBe(false);
  });

  it('defaults to false when neither is set', () => {
    expect(resolveManualPayments({})).toBe(false);
    expect(resolveManualPayments(null)).toBe(false);
  });
});

