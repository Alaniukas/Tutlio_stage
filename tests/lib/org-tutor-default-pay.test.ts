import { describe, expect, it } from 'vitest';
import {
  resolveDefaultTutorPayForSave,
  tutorIdsUsingPreviousDefaultPay,
} from '../../src/lib/orgTutorDefaultPay';

describe('tutorIdsUsingPreviousDefaultPay', () => {
  it('keeps explicit tutor rates out of a default-pay update', () => {
    expect(tutorIdsUsingPreviousDefaultPay([
      { id: 'default', company_commission_percent: 0 },
      { id: 'custom', company_commission_percent: 18 },
      { id: 'unset', company_commission_percent: null },
    ], 0)).toEqual(['default', 'unset']);
  });

  it('recognizes decimal default rates without rounding', () => {
    expect(tutorIdsUsingPreviousDefaultPay([
      { id: 'same', company_commission_percent: 12.5 },
      { id: 'different', company_commission_percent: 12 },
    ], 12.5)).toEqual(['same']);
  });
});

describe('resolveDefaultTutorPayForSave', () => {
  it('keeps the fresher database value when the cached field was not edited', () => {
    expect(resolveDefaultTutorPayForSave(0, 20, false)).toBe(20);
  });

  it('uses the administrator value when the field was edited', () => {
    expect(resolveDefaultTutorPayForSave(12.5, 20, true)).toBe(12.5);
  });
});
