import { describe, expect, it } from 'vitest';
import {
  countProKlaseClientRoster,
  matchesProKlaseClientRosterFilter,
  toggleProKlaseClientRosterFilter,
} from '@/lib/proKlaseClientRoster';

const group = (
  linkedUserId: string | null,
  tutorIds: Array<string | null>,
  detached = false,
) => ({
  primary: { linked_user_id: linkedUserId, detached_at: detached ? '2026-09-01T00:00:00Z' : null },
  rows: tutorIds.map((tutor_id) => ({ tutor_id })),
});

describe('Pro Klasė client roster chips', () => {
  const groups = [
    group('user-1', ['tutor-1']),
    group('user-2', ['tutor-2']),
    group(null, ['tutor-1']),
    group(null, [null]),
    group('user-3', [null]),
    group('user-4', ['tutor-3'], true),
  ];

  it('counts live clients by account and tutor assignment', () => {
    expect(countProKlaseClientRoster(groups)).toEqual({
      all: 5,
      active: 3,
      inactive: 2,
      unassigned: 2,
    });
  });

  it('filters the table to the selected chip', () => {
    const live = groups.filter((g) => !g.primary.detached_at);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'active'))).toHaveLength(3);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'inactive'))).toHaveLength(2);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'unassigned'))).toHaveLength(2);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'all'))).toHaveLength(5);
  });

  it('clicking the active chip again clears back to all clients', () => {
    expect(toggleProKlaseClientRosterFilter('all', 'active')).toBe('active');
    expect(toggleProKlaseClientRosterFilter('active', 'active')).toBe('all');
    expect(toggleProKlaseClientRosterFilter('active', 'inactive')).toBe('inactive');
    expect(toggleProKlaseClientRosterFilter('inactive', 'all')).toBe('all');
  });
});
