import { describe, expect, it } from 'vitest';
import {
  filterPlannedOrgSessions,
  summarizePlannedOrgTutorPay,
} from '@/lib/companyStatsProjection';
import { resolveStatsPeriodMode } from '@/lib/statsDateRange';

describe('company stats forward projection', () => {
  const now = new Date('2026-10-06T12:00:00+03:00');

  it('detects forward-only stats windows', () => {
    expect(resolveStatsPeriodMode({
      start: new Date('2026-11-01'),
      end: new Date('2026-11-30'),
    }, now)).toBe('forward');
  });

  it('counts active future lessons and projected pay', () => {
    const range = {
      startIso: '2026-11-01T00:00:00.000+02:00',
      endIso: '2026-11-30T23:59:59.999+02:00',
    };
    const sessions = [
      { status: 'active', start_time: '2026-11-05T18:00:00+02:00', price: 28, is_complimentary: false },
      { status: 'active', start_time: '2026-11-12T18:00:00+02:00', price: 30, is_complimentary: false },
      { status: 'cancelled', start_time: '2026-11-12T19:00:00+02:00', price: 30, is_complimentary: false },
      { status: 'completed', start_time: '2026-11-01T18:00:00+02:00', price: 28, is_complimentary: false },
    ];

    const planned = filterPlannedOrgSessions(sessions, range, 'forward', now);
    const summary = summarizePlannedOrgTutorPay(planned, {
      organizationId: '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b',
      defaultRate: 15,
    });

    expect(planned).toHaveLength(2);
    expect(summary.plannedSessions).toBe(2);
    expect(summary.projectedRevenue).toBe(58);
    expect(summary.projectedNetEarnings).toBe(30);
    expect(summary.projectedCompanyCommission).toBe(28);
  });

  it('counts only remaining lessons inside a spanning month', () => {
    const range = {
      startIso: '2026-10-01T00:00:00.000+03:00',
      endIso: '2026-10-31T23:59:59.999+03:00',
    };
    const sessions = [
      { status: 'completed', start_time: '2026-10-01T18:00:00+03:00', price: 28, is_complimentary: false },
      { status: 'active', start_time: '2026-10-20T18:00:00+03:00', price: 28, is_complimentary: false },
      { status: 'active', start_time: '2026-10-03T18:00:00+03:00', price: 28, is_complimentary: false },
    ];

    const planned = filterPlannedOrgSessions(sessions, range, 'spanning', now);
    expect(planned).toHaveLength(1);
    expect(planned[0].start_time).toContain('2026-10-20');
  });
});
