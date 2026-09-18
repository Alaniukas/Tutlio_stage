import { describe, expect, it } from 'vitest';
import {
  isSchoolContractSuspended,
  schoolContractBlocksService,
  schoolContractSuspensionOverlapsPeriod,
} from '../../src/lib/schoolContractLifecycle';

describe('schoolContractLifecycle', () => {
  it('automatically ends a dated suspension after the inclusive end date', () => {
    const contract = {
      suspension_started_at: '2026-09-01T08:00:00.000Z',
      suspension_until: '2026-09-30',
    };
    expect(isSchoolContractSuspended(contract, new Date('2026-09-30T10:00:00'))).toBe(true);
    expect(isSchoolContractSuspended(contract, new Date('2026-10-01T10:00:00'))).toBe(false);
  });

  it('uses the school timezone at the inclusive end-date boundary', () => {
    const contract = {
      suspension_started_at: '2026-09-01T08:00:00.000Z',
      suspension_until: '2026-09-30',
    };
    expect(isSchoolContractSuspended(contract, new Date('2026-09-30T20:59:00.000Z'))).toBe(true);
    expect(isSchoolContractSuspended(contract, new Date('2026-09-30T21:01:00.000Z'))).toBe(false);
  });

  it('resumes immediately and always blocks a terminated contract', () => {
    expect(isSchoolContractSuspended({
      suspension_started_at: '2026-09-01T08:00:00.000Z',
      suspension_resumed_at: '2026-09-10T08:00:00.000Z',
    }, new Date('2026-09-05T10:00:00'))).toBe(false);
    expect(schoolContractBlocksService({ terminated_at: '2026-09-01T08:00:00.000Z' })).toBe(true);
  });

  it('holds billing when a suspension overlaps the invoiced month', () => {
    const contract = {
      suspension_started_at: '2026-09-20T08:00:00.000Z',
      suspension_resumed_at: '2026-10-03T08:00:00.000Z',
    };
    expect(schoolContractSuspensionOverlapsPeriod(contract, '2026-09-01', '2026-09-30')).toBe(true);
    expect(schoolContractSuspensionOverlapsPeriod(contract, '2026-08-01', '2026-08-31')).toBe(false);
  });

  it('does not move an after-midnight Vilnius suspension into the previous billing month', () => {
    const contract = {
      suspension_started_at: '2026-09-30T21:30:00.000Z',
    };
    expect(schoolContractSuspensionOverlapsPeriod(contract, '2026-09-01', '2026-09-30')).toBe(false);
    expect(schoolContractSuspensionOverlapsPeriod(contract, '2026-10-01', '2026-10-31')).toBe(true);
  });
});
