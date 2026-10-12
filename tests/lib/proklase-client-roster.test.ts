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
  enrollment_status = 'active',
) => ({
  primary: { linked_user_id: linkedUserId, detached_at: detached ? '2026-09-01T00:00:00Z' : null, enrollment_status },
  rows: tutorIds.map((tutor_id) => ({ tutor_id, enrollment_status, detached_at: detached ? '2026-09-01T00:00:00Z' : null })),
});

describe('Pro Klasė client roster chips', () => {
  const groups = [
    group('user-1', ['tutor-1']),
    group('user-2', ['tutor-2']),
    group(null, ['tutor-1']),
    group(null, [null]),
    group('user-3', [null]),
    group('user-4', ['tutor-3'], true),
    group('user-5', ['tutor-1', 'tutor-2'], false, 'left'),
    group('user-6', [null], true, 'left'),
  ];

  it('counts live clients by account and tutor assignment', () => {
    expect(countProKlaseClientRoster(groups)).toEqual({
      all: 5,
      active: 3,
      inactive: 2,
      unassigned: 2,
      left: 1,
    });
  });

  it('filters the table to the selected chip', () => {
    const live = groups.filter((g) => !g.primary.detached_at);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'active'))).toHaveLength(3);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'inactive'))).toHaveLength(2);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'unassigned'))).toHaveLength(2);
    expect(live.filter((g) => matchesProKlaseClientRosterFilter(g, 'all'))).toHaveLength(5);
    expect(groups.filter((g) => matchesProKlaseClientRosterFilter(g, 'left'))).toHaveLength(1);
    expect(groups.filter((g) => matchesProKlaseClientRosterFilter(g, 'unassigned'))).toHaveLength(2);
  });

  it('counts a former client once across tutors even when a duplicate row has stale status', () => {
    const client = group('user-1', ['tutor-1', 'tutor-2']);
    client.rows[1].enrollment_status = 'left';
    expect(countProKlaseClientRoster([client])).toEqual({ all: 0, active: 0, inactive: 0, unassigned: 0, left: 1 });
  });

  it('does not treat an archived historical tutor row as a current departure', () => {
    const client = group('user-1', ['tutor-1']);
    client.rows.push({ tutor_id: 'old-tutor', enrollment_status: 'left', detached_at: '2026-10-01T00:00:00Z' });
    expect(countProKlaseClientRoster([client])).toEqual({ all: 1, active: 1, inactive: 0, unassigned: 0, left: 0 });
  });

  it('clicking the active chip again clears back to all clients', () => {
    expect(toggleProKlaseClientRosterFilter('all', 'active')).toBe('active');
    expect(toggleProKlaseClientRosterFilter('active', 'active')).toBe('all');
    expect(toggleProKlaseClientRosterFilter('active', 'inactive')).toBe('inactive');
    expect(toggleProKlaseClientRosterFilter('inactive', 'all')).toBe('all');
    expect(toggleProKlaseClientRosterFilter('all', 'left')).toBe('left');
    expect(toggleProKlaseClientRosterFilter('left', 'left')).toBe('all');
  });
});
