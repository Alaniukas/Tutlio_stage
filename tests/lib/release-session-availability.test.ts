import { describe, it, expect } from 'vitest';
import { sessionInstantToAvailabilityFields } from '@/lib/releaseSessionAvailability';

describe('sessionInstantToAvailabilityFields', () => {
  it('maps UTC instant to Vilnius wall-clock date and times', () => {
    // 2026-05-21 12:00 UTC = 15:00 Vilnius (EEST)
    const { specificDate, startTime, endTime } = sessionInstantToAvailabilityFields(
      '2026-05-21T12:00:00.000Z',
      '2026-05-21T12:45:00.000Z',
    );
    expect(specificDate).toBe('2026-05-21');
    expect(startTime).toBe('15:00');
    expect(endTime).toBe('15:45');
  });
});
