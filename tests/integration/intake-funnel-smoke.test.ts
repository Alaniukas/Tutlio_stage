// End-to-end smoke test for the highest-risk Pro Klase intake-funnel flows.
//
// It wires the REAL production helpers together against a tiny in-memory
// Supabase fake so the full lifecycle is exercised without a live DB or running
// API — safe to run on every deploy via `npm test`:
//
//   A. Package reserve -> pay -> month-bound expiry (happy path)
//   B. Package reserve -> unpaid past deadline -> auto-release cron
//   C. Auto-release safety: a paid package's holds are never cancelled
//   D. Month-boundary correctness + payment-deadline clamping (the audit fixes)
//
// The fake supports just the query shapes these code paths use; it is NOT a
// general Supabase mock.
import { describe, it, expect, vi } from 'vitest';

// Neutralize Google Calendar sync (its module creates a Supabase client at load
// time and the cron calls it fire-and-forget on release).
vi.mock('../../api/_lib/google-calendar', () => ({
  deleteSessionFromGoogle: vi.fn(() => Promise.resolve()),
}));

import { reservePackageSlots, type PackageReservableItem } from '../../api/_lib/packageSlots';
import { applyMonthlyPackageExpiry, endOfMonthIso } from '../../api/_lib/packageMonth';
import { packagePaymentDeadlineIso, getPackagePaymentDeadlineHours } from '../../api/_lib/trialReservation';
import { releaseExpiredReservations } from '../../api/expire-trial-reservations';
import { FakeSupabase } from '../helpers/fakeSupabase';

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const ITEMS: PackageReservableItem[] = [
  { subjectId: 'subj-1', subjectName: 'Matematika', pricePerLesson: 20, totalLessons: 4 },
];

function seed(
  fake: FakeSupabase,
  opts: { features: Record<string, unknown>; paid?: boolean; totalLessons?: number } = { features: {} },
) {
  const total = opts.totalLessons ?? 4;
  const paid = opts.paid ?? false;
  fake.db.organizations = [{ id: 'org-1', features: opts.features }];
  fake.db.profiles = [{ id: 'tutor-1', organization_id: 'org-1' }];
  fake.db.lesson_packages = [
    {
      id: 'pkg-1',
      tutor_id: 'tutor-1',
      student_id: 'stu-1',
      total_lessons: total,
      available_lessons: total,
      reserved_lessons: 0,
      paid,
      active: true,
      payment_status: paid ? 'paid' : 'pending',
    },
  ];
  fake.db.lesson_package_items = [
    {
      id: 'item-1',
      package_id: 'pkg-1',
      subject_id: 'subj-1',
      total_lessons: total,
      available_lessons: total,
      reserved_lessons: 0,
    },
  ];
  fake.db.sessions = [];
}

// Mirror the atomic reserved->paid flip shared by stripe-webhook /
// confirm-package-payment / confirm-manual-payment.
async function confirmReservedHolds(fake: FakeSupabase, packageId: string) {
  const { data } = await fake
    .from('sessions')
    .update({ paid: true, payment_status: 'paid', reservation_expires_at: null })
    .eq('lesson_package_id', packageId)
    .eq('payment_status', 'reserved')
    .select('id');
  return data as Row[];
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

describe('intake funnel smoke: package reserve -> pay -> expiry', () => {
  it('A. reserves holds, moves credits, then pays and caps validity to the lesson month', async () => {
    const fake = new FakeSupabase();
    seed(fake, { features: { package_reservation_flow: true, monthly_packages: true } });

    const now = new Date('2026-07-20T09:00:00.000Z');
    const slots = [
      { subjectId: 'subj-1', startIso: '2026-08-10T13:00:00.000Z', endIso: '2026-08-10T14:00:00.000Z' },
      { subjectId: 'subj-1', startIso: '2026-08-17T13:00:00.000Z', endIso: '2026-08-17T14:00:00.000Z' },
    ];
    const deadlineHours = getPackagePaymentDeadlineHours(fake.db.organizations[0].features);

    const result = await reservePackageSlots(fake as any, {
      tutorId: 'tutor-1',
      studentId: 'stu-1',
      packageId: 'pkg-1',
      slots,
      items: ITEMS,
      deadlineHours,
      now,
    });

    // --- reserve assertions ---
    expect(result.error).toBeUndefined();
    expect(result.reservedCount).toBe(2);
    expect(result.reservationExpiresAt).toBe(packagePaymentDeadlineIso('2026-08-10T13:00:00.000Z', 24, now));
    expect(result.reservationExpiresAt).toBe('2026-08-09T13:00:00.000Z'); // first lesson - 24h

    expect(fake.db.sessions).toHaveLength(2);
    for (const h of fake.db.sessions) {
      expect(h).toMatchObject({
        status: 'active',
        payment_status: 'reserved',
        paid: false,
        lesson_package_id: 'pkg-1',
        reservation_expires_at: '2026-08-09T13:00:00.000Z',
      });
    }
    expect(fake.db.lesson_package_items[0]).toMatchObject({ available_lessons: 2, reserved_lessons: 2 });
    expect(fake.db.lesson_packages[0]).toMatchObject({ available_lessons: 2, reserved_lessons: 2 });

    // --- pay: mark package paid, flip the reserved holds, cap month validity ---
    await fake.from('lesson_packages').update({ paid: true, payment_status: 'paid' }).eq('id', 'pkg-1');
    const confirmed = await confirmReservedHolds(fake, 'pkg-1');
    expect(confirmed).toHaveLength(2);
    await applyMonthlyPackageExpiry(fake as any, { packageId: 'pkg-1', tutorId: 'tutor-1' });

    // --- pay assertions ---
    for (const h of fake.db.sessions) {
      expect(h).toMatchObject({ payment_status: 'paid', paid: true, reservation_expires_at: null });
    }
    // End of August in Europe/Vilnius == first moment of September (UTC).
    expect(fake.db.lesson_packages[0].expires_at).toBe('2026-09-01T00:00:00.000Z');
    expect(fake.db.lesson_packages[0].expires_at).toBe(endOfMonthIso(new Date('2026-08-10T13:00:00.000Z')));

    // exactly-once: a second confirm flips nothing (no duplicate notifications)
    const confirmedAgain = await confirmReservedHolds(fake, 'pkg-1');
    expect(confirmedAgain).toHaveLength(0);
  });

  it('B. auto-releases the holds and deactivates the package when unpaid past the deadline', async () => {
    const fake = new FakeSupabase();
    seed(fake, { features: { package_reservation_flow: true } });

    const now = new Date('2026-07-20T09:00:00.000Z');
    const slots = [
      { subjectId: 'subj-1', startIso: '2026-09-05T13:00:00.000Z', endIso: '2026-09-05T14:00:00.000Z' },
      { subjectId: 'subj-1', startIso: '2026-09-12T13:00:00.000Z', endIso: '2026-09-12T14:00:00.000Z' },
    ];
    const res = await reservePackageSlots(fake as any, {
      tutorId: 'tutor-1',
      studentId: 'stu-1',
      packageId: 'pkg-1',
      slots,
      items: ITEMS,
      deadlineHours: 24,
      now,
    });
    expect(res.reservedCount).toBe(2);
    expect(res.reservationExpiresAt).toBe('2026-09-04T13:00:00.000Z');

    // Cron runs after the deadline but before the first lesson.
    const cronNow = new Date('2026-09-05T00:00:00.000Z');
    const out = await releaseExpiredReservations(fake as any, { now: cronNow });

    expect(out).toEqual({ released: 2, packagesExpired: 1 });
    for (const h of fake.db.sessions) {
      expect(h).toMatchObject({
        status: 'cancelled',
        payment_status: 'expired',
        cancelled_at: cronNow.toISOString(),
      });
      expect(h.cancellation_reason).toContain('nebuvo apmokėta');
    }
    expect(fake.db.lesson_packages[0]).toMatchObject({ active: false, payment_status: 'expired' });
  });

  it('C. never cancels holds whose package was already paid (late-webhook safety)', async () => {
    const fake = new FakeSupabase();
    seed(fake, { features: { package_reservation_flow: true }, paid: true });
    fake.db.sessions = [
      {
        id: 'sess-paid-1',
        tutor_id: 'tutor-1',
        student_id: 'stu-1',
        lesson_package_id: 'pkg-1',
        start_time: '2026-09-05T13:00:00.000Z',
        end_time: '2026-09-05T14:00:00.000Z',
        status: 'active',
        payment_status: 'reserved',
        paid: false,
        reservation_expires_at: '2026-09-04T13:00:00.000Z', // already past
      },
    ];

    const out = await releaseExpiredReservations(fake as any, { now: new Date('2026-09-10T00:00:00.000Z') });

    expect(out).toEqual({ released: 0, packagesExpired: 0 });
    expect(fake.db.sessions[0]).toMatchObject({ status: 'active', payment_status: 'reserved' });
    expect(fake.db.lesson_packages[0]).toMatchObject({ active: true, payment_status: 'paid' });
  });
});

describe('intake funnel smoke: month boundary + deadline clamping', () => {
  it('D1. anchors month-bound validity on the local (Vilnius) month at the start-of-month edge', async () => {
    const fake = new FakeSupabase();
    seed(fake, { features: { monthly_packages: true }, paid: true });
    // 2026-07-31T22:00Z == 2026-08-01 01:00 in Vilnius (summer, UTC+3): belongs to August.
    fake.db.sessions = [
      {
        id: 's1',
        tutor_id: 'tutor-1',
        student_id: 'stu-1',
        lesson_package_id: 'pkg-1',
        start_time: '2026-07-31T22:00:00.000Z',
        end_time: '2026-07-31T23:00:00.000Z',
        status: 'active',
        payment_status: 'paid',
        paid: true,
      },
    ];

    await applyMonthlyPackageExpiry(fake as any, { packageId: 'pkg-1', tutorId: 'tutor-1' });

    // Must expire at the end of August (Sep 1), NOT the end of July.
    expect(fake.db.lesson_packages[0].expires_at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('D1b. grants a slot-less paid package at least one month from paid_at', async () => {
    const fake = new FakeSupabase();
    seed(fake, { features: { monthly_packages: true }, paid: true });
    // Paid near the end of June, no pre-booked lessons: must NOT die on July 1.
    fake.db.lesson_packages[0].paid_at = '2026-06-28T14:00:00.000Z';
    fake.db.sessions = [];

    await applyMonthlyPackageExpiry(fake as any, { packageId: 'pkg-1', tutorId: 'tutor-1' });

    expect(fake.db.lesson_packages[0].expires_at).toBe('2026-07-28T14:00:00.000Z');
  });

  it('D2. clamps the package payment deadline to now+1h when the first lesson is too soon', async () => {
    const fake = new FakeSupabase();
    seed(fake, { features: { package_reservation_flow: true } });

    const now = new Date('2026-07-20T09:00:00.000Z');
    const soonStart = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30 min away
    const soonEnd = new Date(now.getTime() + 90 * 60 * 1000).toISOString();

    const res = await reservePackageSlots(fake as any, {
      tutorId: 'tutor-1',
      studentId: 'stu-1',
      packageId: 'pkg-1',
      slots: [{ subjectId: 'subj-1', startIso: soonStart, endIso: soonEnd }],
      items: ITEMS,
      deadlineHours: 24,
      now,
    });

    expect(res.reservationExpiresAt).toBe(new Date(now.getTime() + 3_600_000).toISOString());
    expect(fake.db.sessions[0].reservation_expires_at).toBe('2026-07-20T10:00:00.000Z');
  });

  it('D3. rejects a slot that conflicts with an existing active lesson', async () => {
    const fake = new FakeSupabase();
    seed(fake, { features: { package_reservation_flow: true } });
    fake.db.sessions = [
      {
        id: 'existing',
        tutor_id: 'tutor-1',
        status: 'active',
        start_time: '2026-08-10T12:30:00.000Z',
        end_time: '2026-08-10T13:30:00.000Z',
      },
    ];

    const res = await reservePackageSlots(fake as any, {
      tutorId: 'tutor-1',
      studentId: 'stu-1',
      packageId: 'pkg-1',
      slots: [{ subjectId: 'subj-1', startIso: '2026-08-10T13:00:00.000Z', endIso: '2026-08-10T14:00:00.000Z' }],
      items: ITEMS,
      deadlineHours: 24,
      now: new Date('2026-07-20T09:00:00.000Z'),
    });

    expect(res.status).toBe(409);
    expect(res.reservedCount).toBeUndefined();
    // No hold created, credits untouched.
    expect(fake.db.sessions.filter((s) => s.payment_status === 'reserved')).toHaveLength(0);
    expect(fake.db.lesson_packages[0]).toMatchObject({ available_lessons: 4, reserved_lessons: 0 });
  });
});
