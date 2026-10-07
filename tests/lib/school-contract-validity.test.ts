import { describe, expect, it } from 'vitest';
import {
  contractServiceEndDate,
  contractServiceStartDate,
  formatContractValidityLabel,
} from '../../src/lib/schoolContractValidity';

describe('schoolContractValidity', () => {
  it('reads extra-lessons service dates from order snapshot', () => {
    const contract = {
      kind: 'extra_lessons',
      order_snapshot: { start_date: '2026-09-07', end_date: '2027-06-30' },
    };
    expect(contractServiceStartDate(contract)).toBe('2026-09-07');
    expect(contractServiceEndDate(contract)).toBe('2027-06-30');
    expect(formatContractValidityLabel(
      contractServiceStartDate(contract),
      contractServiceEndDate(contract),
      (ymd) => ymd,
    )).toBe('2026-09-07 – 2027-06-30');
  });

  it('ignores annual contracts', () => {
    expect(contractServiceStartDate({ kind: 'annual', order_snapshot: { start_date: '2026-09-07' } })).toBeNull();
  });
});
