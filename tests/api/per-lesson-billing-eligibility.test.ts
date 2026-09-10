import { describe, expect, it, vi } from 'vitest';
import { allowsPerLessonBilling, loadPerLessonBillingFlags } from '../../api/_lib/perLessonBillingEligibility';

describe('per-lesson billing inheritance', () => {
  it.each([
    [null, false, false], [null, true, true],
    ['monthly_billing', true, false], ['prepaid_packages', true, false],
    ['per_lesson', false, true], ['monthly_billing,per_lesson', false, true],
  ])('resolves student %s with owner toggle %s', (model, enabled, expected) => {
    expect(allowsPerLessonBilling(model, { enable_per_lesson: enabled })).toBe(expected);
  });

  it('uses the organization instead of a new tutor’s stale defaults', async () => {
    const single = vi.fn().mockResolvedValue({ data: { enable_per_lesson: false }, error: null });
    const db = { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) };
    const flags = await loadPerLessonBillingFlags(db as any, { organization_id: 'org', enable_per_lesson: true });
    expect(allowsPerLessonBilling(null, flags)).toBe(false);
  });

  it('does not allow charging when organization lookup fails', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ error: {} }) }) }) }) };
    await expect(loadPerLessonBillingFlags(db as any, { organization_id: 'org', enable_per_lesson: true })).rejects.toThrow();
  });
});
