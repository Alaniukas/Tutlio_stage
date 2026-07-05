import { describe, it, expect, vi } from 'vitest';
import { endOfMonthIso, plusOneMonthIso, applyMonthlyPackageExpiry } from '../../api/_lib/packageMonth';

describe('endOfMonthIso', () => {
  it('returns the first moment of the next calendar month (Europe/Vilnius)', () => {
    expect(endOfMonthIso(new Date('2026-06-10T08:00:00.000Z'))).toBe('2026-07-01T00:00:00.000Z');
    expect(endOfMonthIso(new Date('2026-02-01T00:00:00.000Z'))).toBe('2026-03-01T00:00:00.000Z');
    expect(endOfMonthIso(new Date('2024-02-15T12:00:00.000Z'))).toBe('2024-03-01T00:00:00.000Z'); // leap
  });

  it('rolls the year over in December', () => {
    expect(endOfMonthIso(new Date('2026-12-15T10:00:00.000Z'))).toBe('2027-01-01T00:00:00.000Z');
  });

  it('anchors on the local month, not UTC, near the start-of-month boundary', () => {
    // 2026-07-31T22:00Z is 2026-08-01 01:00 in Vilnius (summer, UTC+3): the
    // package must belong to August, not expire at the end of July.
    expect(endOfMonthIso(new Date('2026-07-31T22:00:00.000Z'))).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('plusOneMonthIso', () => {
  it('keeps the same wall-clock instant one month later', () => {
    expect(plusOneMonthIso(new Date('2026-03-12T10:00:00.000Z'))).toBe('2026-04-12T10:00:00.000Z');
  });

  it('clamps the day to the target month length', () => {
    expect(plusOneMonthIso(new Date('2026-01-31T08:30:00.000Z'))).toBe('2026-02-28T08:30:00.000Z'); // non-leap
    expect(plusOneMonthIso(new Date('2024-01-31T08:30:00.000Z'))).toBe('2024-02-29T08:30:00.000Z'); // leap
    expect(plusOneMonthIso(new Date('2026-05-31T00:00:00.000Z'))).toBe('2026-06-30T00:00:00.000Z');
  });

  it('rolls the year over in December', () => {
    expect(plusOneMonthIso(new Date('2026-12-15T23:59:00.000Z'))).toBe('2027-01-15T23:59:00.000Z');
  });
});

/**
 * Minimal Supabase stub: records the lesson_packages update payload and serves
 * canned reads for profiles / organizations / sessions.
 */
function makeSupabase(opts: {
  orgId?: string | null;
  features?: Record<string, unknown> | null;
  firstSessionStart?: string | null;
  paidAt?: string | null;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: opts.orgId ?? null } }) }) }),
      } as any;
    }
    if (table === 'organizations') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { features: opts.features ?? null } }) }) }),
      } as any;
    }
    if (table === 'sessions') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: opts.firstSessionStart ? { start_time: opts.firstSessionStart } : null }) }) }),
            }),
          }),
        }),
      } as any;
    }
    if (table === 'lesson_packages') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { paid_at: opts.paidAt ?? null } }) }) }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(payload);
            return { error: null };
          },
        }),
      } as any;
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from } as any, updates };
}

describe('applyMonthlyPackageExpiry', () => {
  it('does nothing without a tutorId', async () => {
    const { client, updates } = makeSupabase({});
    await applyMonthlyPackageExpiry(client, { packageId: 'pkg-1', tutorId: null });
    expect(updates).toHaveLength(0);
  });

  it('is a no-op when the org does not have monthly_packages', async () => {
    const { client, updates } = makeSupabase({ orgId: 'org-1', features: { monthly_packages: false } });
    await applyMonthlyPackageExpiry(client, { packageId: 'pkg-1', tutorId: 'tutor-1' });
    expect(updates).toHaveLength(0);
  });

  it('sets expires_at to the end of the first lesson month when enabled', async () => {
    const { client, updates } = makeSupabase({
      orgId: 'org-1',
      features: { monthly_packages: true },
      firstSessionStart: '2026-06-05T09:00:00.000Z',
    });
    await applyMonthlyPackageExpiry(client, { packageId: 'pkg-1', tutorId: 'tutor-1' });
    expect(updates).toEqual([{ expires_at: '2026-07-01T00:00:00.000Z' }]);
  });

  it('grants at least one month from paid_at when there is no booked lesson', async () => {
    const { client, updates } = makeSupabase({
      orgId: 'org-1',
      features: { monthly_packages: true },
      firstSessionStart: null,
      paidAt: '2026-03-12T10:00:00.000Z',
    });
    await applyMonthlyPackageExpiry(client, { packageId: 'pkg-1', tutorId: 'tutor-1' });
    expect(updates).toEqual([{ expires_at: '2026-04-12T10:00:00.000Z' }]);
  });

  it('a slot-less package paid at the end of a month does not expire with that month', async () => {
    const { client, updates } = makeSupabase({
      orgId: 'org-1',
      features: { monthly_packages: true },
      firstSessionStart: null,
      paidAt: '2026-06-28T14:00:00.000Z',
    });
    await applyMonthlyPackageExpiry(client, { packageId: 'pkg-1', tutorId: 'tutor-1' });
    expect(updates).toEqual([{ expires_at: '2026-07-28T14:00:00.000Z' }]);
  });

  it('falls back to now + 1 month when paid_at is missing', async () => {
    const { client, updates } = makeSupabase({
      orgId: 'org-1',
      features: { monthly_packages: true },
      firstSessionStart: null,
      paidAt: null,
    });
    const now = new Date('2026-03-12T10:00:00.000Z');
    await applyMonthlyPackageExpiry(client, { packageId: 'pkg-1', tutorId: 'tutor-1', now });
    expect(updates).toEqual([{ expires_at: '2026-04-12T10:00:00.000Z' }]);
  });
});
