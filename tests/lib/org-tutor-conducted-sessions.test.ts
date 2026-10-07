import { describe, expect, it } from 'vitest';
import {
  companyConductedSessionOptions,
  countConductedOrgSessions,
  filterConductedOrgSessions,
  isConductedOrgSession,
} from '@/lib/orgTutorConductedSessions';
import { isManoKorepetitoriusOrg, isProKlaseOrg } from '@/lib/marketMoney';

describe('organization conducted lesson counts', () => {
  const now = new Date('2026-10-06T12:00:00+03:00');

  it('keeps an excluded row available to financial logic but omits it from the count', () => {
    const sessions = [
      { id: 'real', status: 'completed', exclude_from_lesson_count: false },
      { id: 'payment-transfer', status: 'completed', exclude_from_lesson_count: true },
    ];

    expect(filterConductedOrgSessions(sessions)).toHaveLength(2);
    expect(countConductedOrgSessions(sessions)).toBe(1);
  });

  it('counts ended active lessons when includeEndedActive is enabled', () => {
    const sessions = [
      { id: 'done', status: 'completed', end_time: '2026-09-22T19:30:00+03:00' },
      {
        id: 'stale',
        status: 'active',
        end_time: '2026-09-01T19:00:00+03:00',
        exclude_from_lesson_count: false,
      },
      {
        id: 'future',
        status: 'active',
        end_time: '2026-10-10T19:00:00+03:00',
        exclude_from_lesson_count: false,
      },
    ];

    expect(countConductedOrgSessions(sessions, { includeEndedActive: true, now })).toBe(2);
    expect(countConductedOrgSessions(sessions)).toBe(1);
    expect(isConductedOrgSession('active', sessions[1], { includeEndedActive: true, now })).toBe(true);
    expect(isConductedOrgSession('active', sessions[2], { includeEndedActive: true, now })).toBe(false);
  });

  it('enables ended-active counts only for auto-complete company orgs', () => {
    const mkOrgId = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';
    expect(isManoKorepetitoriusOrg(mkOrgId)).toBe(true);
    expect(companyConductedSessionOptions({ organizationId: mkOrgId, entityType: 'company' }).includeEndedActive).toBe(true);
    expect(companyConductedSessionOptions({ organizationId: mkOrgId, entityType: 'school' }).includeEndedActive).toBe(false);

    const proKlaseOrgId = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
    expect(isProKlaseOrg(proKlaseOrgId)).toBe(true);
    expect(companyConductedSessionOptions({ organizationId: proKlaseOrgId, entityType: 'company' }).includeEndedActive).toBe(false);

    expect(companyConductedSessionOptions({
      organizationId: 'other-org',
      entityType: 'company',
      requireConfirmation: true,
    }).includeEndedActive).toBe(false);
  });
});
