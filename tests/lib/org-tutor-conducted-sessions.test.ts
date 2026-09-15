import { describe, expect, it } from 'vitest';
import {
  countConductedOrgSessions,
  filterConductedOrgSessions,
} from '@/lib/orgTutorConductedSessions';

describe('organization conducted lesson counts', () => {
  it('keeps an excluded row available to financial logic but omits it from the count', () => {
    const sessions = [
      { id: 'real', status: 'completed', exclude_from_lesson_count: false },
      { id: 'payment-transfer', status: 'completed', exclude_from_lesson_count: true },
    ];

    expect(filterConductedOrgSessions(sessions)).toHaveLength(2);
    expect(countConductedOrgSessions(sessions)).toBe(1);
  });
});
