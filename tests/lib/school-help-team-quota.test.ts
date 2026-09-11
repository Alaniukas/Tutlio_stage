import { describe, expect, it } from 'vitest';
import { computeHelpTeamQuota, familyHelpTeamQuota, helpTeamPriceEur } from '@/lib/schoolHelpTeamQuota';

describe('schoolHelpTeamQuota', () => {
  it('uses max PPT level across family', () => {
    expect(familyHelpTeamQuota([{}, { ppt_adapted: true }])).toBe(3);
    expect(familyHelpTeamQuota([{ ppt_individualized: true }, { ppt_adapted: true }])).toBe(4);
  });

  it('counts used and reserved visits per category', () => {
    const q = computeHelpTeamQuota({
      quota: 2,
      category: 'speech',
      consultations: [
        { help_team_category: 'speech', status: 'occurred', outcome: 'occurred' },
        { help_team_category: 'speech', status: 'confirmed', start_time: '2099-06-01T10:00:00Z' },
        { help_team_category: 'psychologist', status: 'occurred', outcome: 'occurred' },
      ],
    });
    expect(q.used).toBe(1);
    expect(q.reserved).toBe(1);
    expect(q.remaining).toBe(0);
    expect(q.nextIsPaid).toBe(true);
  });

  it('computes proportional hourly price', () => {
    expect(helpTeamPriceEur(45, 40)).toBe(30);
  });
});
