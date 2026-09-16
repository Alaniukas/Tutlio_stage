import { describe, expect, it, vi } from 'vitest';
import {
  allowsPerLessonBilling,
  allowsPerLessonBillingForOwner,
  loadPerLessonBillingFlags,
} from '../../api/_lib/perLessonBillingEligibility';

describe('per-lesson billing inheritance', () => {
  it.each([
    [null, false, false, false], [null, true, false, true], [null, true, true, false],
    ['monthly_billing', true, false, false], ['prepaid_packages', true, false, false],
    ['per_lesson', false, true, true], ['monthly_billing,per_lesson', false, true, true],
  ])('resolves student %s with per-lesson=%s monthly=%s', (model, perLesson, monthly, expected) => {
    expect(allowsPerLessonBilling(model, {
      enable_per_lesson: perLesson,
      enable_monthly_billing: monthly,
    })).toBe(expected);
  });

  it('uses the organization instead of a new tutor’s stale defaults', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { enable_per_lesson: false, enable_monthly_billing: true },
      error: null,
    });
    const db = { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) };
    const flags = await loadPerLessonBillingFlags(db as any, { organization_id: 'org', enable_per_lesson: true });
    expect(allowsPerLessonBilling(null, flags)).toBe(false);
  });

  it('does not allow charging when organization lookup fails', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ error: {} }) }) }) }) };
    await expect(loadPerLessonBillingFlags(db as any, { organization_id: 'org', enable_per_lesson: true })).rejects.toThrow();
  });

  it('uses the live organization toggle for students without an explicit model', () => {
    const organizationFlags = new Map([
      ['org-monthly', { enable_per_lesson: false, enable_monthly_billing: true }],
      ['org-per-lesson', { enable_per_lesson: true, enable_monthly_billing: false }],
    ]);
    expect(allowsPerLessonBillingForOwner(null, {
      organization_id: 'org-monthly',
      enable_per_lesson: true,
    }, organizationFlags)).toBe(false);
    expect(allowsPerLessonBillingForOwner(null, {
      organization_id: 'org-per-lesson',
      enable_per_lesson: false,
    }, organizationFlags)).toBe(true);
  });

  it('keeps explicit student choices authoritative and fails closed for a missing organization', () => {
    const organizationFlags = new Map();
    expect(allowsPerLessonBillingForOwner('per_lesson', {
      organization_id: 'missing-org',
      enable_per_lesson: false,
    }, organizationFlags)).toBe(true);
    expect(allowsPerLessonBillingForOwner('monthly_billing', {
      organization_id: 'missing-org',
      enable_per_lesson: true,
    }, organizationFlags)).toBe(false);
    expect(allowsPerLessonBillingForOwner(null, {
      organization_id: 'missing-org',
      enable_per_lesson: true,
    }, organizationFlags)).toBe(false);
  });
});
