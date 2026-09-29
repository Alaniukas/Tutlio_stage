import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cancelSession from '../../api/cancel-session.js';
import resolvePenalty from '../../api/cancel-penalty-resolution.js';
import type { VercelRequest, VercelResponse } from '../../api/types';
import { PRO_KLASE_QA_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  student: {} as Record<string, unknown>,
  pkg: {} as Record<string, unknown>,
  item: {} as Record<string, unknown>,
  writes: [] as Array<{ table: string; values: Record<string, unknown> }>,
  failFinalize: false,
  auth: { isInternal: true, userId: undefined as string | undefined },
  adminOrg: null as string | null,
  tutor: {} as Record<string, unknown>,
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.auth }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.adminOrg
  ? { organizationId: state.adminOrg, role: 'owner', permissions: {} } : null }));
vi.mock('../../api/_lib/google-calendar.js', () => ({ deleteSessionFromGoogle: async () => {}, syncSessionToGoogle: async () => {} }));
vi.mock('../../api/_lib/release-session-availability.js', () => ({ releaseSessionSlotAsAvailability: async () => ({ created: false }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let mutation: Record<string, unknown> | null = null;
    const source = () => table === 'sessions' ? [state.session]
      : table === 'students' ? [state.student]
      : table === 'profiles' ? [state.tutor]
      : table === 'lesson_packages' ? [state.pkg]
      : table === 'lesson_package_items' ? [state.item]
      : [];
    const result = (single: boolean) => {
      const rows = source().filter((row) => filters.every((filter) => filter(row)));
      if (mutation) {
        if (state.failFinalize && table === 'sessions' && mutation.penalty_resolution === null) {
          return { data: null, error: { code: 'TEST_FINALIZE_ERROR' } };
        }
        for (const row of rows) Object.assign(row, mutation);
        if (rows.length) state.writes.push({ table, values: { ...mutation } });
      }
      return { data: single ? (rows[0] ? { ...rows[0] } : null) : rows.map((row) => ({ ...row })),
        error: single && !rows.length ? { code: 'PGRST116' } : null };
    };
    const query = {
      select: () => query,
      update: (values: Record<string, unknown>) => { mutation = values; return query; },
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      neq: (key: string, value: unknown) => { filters.push((row) => row[key] !== value); return query; },
      is: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      order: () => query, limit: () => query,
      maybeSingle: async () => result(true), single: async () => result(true),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result(false)).then(resolve),
    };
    return query;
  },
}) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response() {
  const capture: { status: number; body: Record<string, unknown> | null } = { status: 0, body: null };
  const res = {
    status: (status: number) => { capture.status = status; return res; },
    json: (body: Record<string, unknown>) => { capture.body = body; return res; },
  };
  return { capture, res: res as unknown as VercelResponse };
}

function request(overrides: Record<string, unknown> = {}): VercelRequest {
  return { method: 'POST', headers: {}, body: {
    sessionId: 'lesson', tutorId: 'tutor', reason: 'No longer attending', cancelledBy: 'student',
    studentName: 'Ada', tutorName: 'Teacher', studentEmail: null, tutorEmail: null,
    cancellationHours: 24, cancellationFeePercent: 0, ...overrides,
  } } as VercelRequest;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  state.session = {
    id: 'lesson', tutor_id: 'tutor', student_id: 'child', status: 'active',
    start_time: '2026-10-01T14:00:00Z', end_time: '2026-10-01T15:00:00Z',
    price: 25, paid: false, subject_id: null, lesson_package_id: null,
    cancellation_penalty_amount: null, penalty_resolution: null, is_late_cancelled: false,
  };
  state.student = { id: 'child', email: null, payer_email: null, payment_model: 'per_lesson', organization_id: null };
  state.pkg = { id: 'package', available_lessons: 2, reserved_lessons: 1 };
  state.item = { id: 'item', package_id: 'package', subject_id: 'maths', available_lessons: 2, reserved_lessons: 1 };
  state.writes = [];
  state.failFinalize = false;
  state.auth = { isInternal: true, userId: undefined };
  state.adminOrg = null;
  state.tutor = { id: 'tutor', email: null, organization_id: null };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('cancellation processing guard', () => {
  it.each([true, false])('honors Pro Klasė admin notifyStudent=%s while keeping tutor email', async (notifyStudent) => {
    state.auth = { isInternal: false, userId: 'admin' };
    state.adminOrg = PRO_KLASE_QA_ORG_ID;
    state.tutor = { id: 'tutor', email: 'teacher@example.com', organization_id: PRO_KLASE_QA_ORG_ID };
    state.student.email = 'student@example.com';
    state.student.payer_email = 'parent@example.com';
    const { res, capture } = response();
    await cancelSession(request({ cancelledBy: 'tutor', notifyStudent }), res);
    expect(capture.status).toBe(200);
    const recipients = vi.mocked(fetch).mock.calls
      .filter(([url]) => String(url).includes('/api/send-email'))
      .map(([, options]) => JSON.parse(String(options?.body)).to).sort();
    expect(recipients).toEqual(notifyStudent
      ? ['parent@example.com', 'student@example.com', 'teacher@example.com']
      : ['teacher@example.com']);
    expect(state.session.status).toBe('cancelled');
  });

  it('blocks family cleanup while notifications are pending and clears the guard after a free cancellation finishes', async () => {
    state.student.email = 'ada@example.com';
    const emailStarted = deferred<void>();
    const emailFinished = deferred<{ ok: boolean }>();
    vi.stubGlobal('fetch', vi.fn(() => { emailStarted.resolve(); return emailFinished.promise; }));
    const { res, capture } = response();
    const running = cancelSession(request(), res);
    await emailStarted.promise;

    expect(state.session.status).toBe('cancelled');
    expect(state.session.penalty_resolution).toBe('pending');
    expect(state.session.cancellation_penalty_amount).toBeNull();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].values).toMatchObject({ status: 'cancelled', penalty_resolution: 'pending', cancellation_penalty_amount: null });
    expect(capture.body).toBeNull();

    emailFinished.resolve({ ok: true });
    await running;
    expect(capture.status).toBe(200);
    expect(state.session.penalty_resolution).toBeNull();
    expect(state.session.cancellation_penalty_amount).toBe(0);
  });

  it('returns package credit once and clears the provisional guard only after the counters are updated', async () => {
    state.session.lesson_package_id = 'package';
    state.session.subject_id = 'maths';
    state.session.paid = true;
    const { res, capture } = response();
    await cancelSession(request(), res);

    expect(capture.status).toBe(200);
    expect(state.pkg).toMatchObject({ available_lessons: 3, reserved_lessons: 0 });
    expect(state.item).toMatchObject({ available_lessons: 3, reserved_lessons: 0 });
    expect(state.writes.at(-1)).toEqual({ table: 'sessions', values: { cancellation_penalty_amount: 0, penalty_resolution: null } });
    state.writes = [];
    await cancelSession(request(), response().res);
    expect(state.pkg.available_lessons).toBe(3);
    expect(state.writes).toEqual([]);
  });

  it.each([
    { paymentModel: 'per_lesson', paid: false, stripePaid: false, expected: 'paid' },
    { paymentModel: 'per_lesson', paid: true, stripePaid: true, expected: 'paid' },
    { paymentModel: 'monthly_billing', paid: false, stripePaid: false, expected: 'invoiced' },
    { paymentModel: 'per_lesson', paid: true, stripePaid: false, expected: 'pending' },
  ])('retains the finalized $expected resolution for a late $paymentModel cancellation', async ({ paymentModel, paid, stripePaid, expected }) => {
    state.session.start_time = '2026-09-28T14:00:00Z';
    state.session.paid = paid;
    state.student.payment_model = paymentModel;
    const { res, capture } = response();
    await cancelSession(request({ cancellationFeePercent: 20, penaltyPaidViaStripe: stripePaid }), res);

    expect(capture.status).toBe(200);
    expect(state.session.penalty_resolution).toBe(expected);
    expect(state.session.cancellation_penalty_amount).toBe(5);
    expect(state.writes.some((write) => write.values.penalty_resolution === null)).toBe(false);
  });

  it('retains the real zero-fee refund choice for an early prepaid lesson', async () => {
    state.session.paid = true;
    const { res, capture } = response();
    await cancelSession(request(), res);

    expect(capture.body).toMatchObject({ success: true, needsPenaltyChoice: true });
    expect(state.session.penalty_resolution).toBe('pending');
    expect(state.session.cancellation_penalty_amount).toBe(0);
  });

  it('does not overwrite an already-finalized cancellation or refund it again', async () => {
    state.session.status = 'cancelled';
    state.session.penalty_resolution = 'paid';
    state.session.cancellation_penalty_amount = 5;
    state.session.is_late_cancelled = true;
    state.session.lesson_package_id = 'package';
    const { res, capture } = response();
    await cancelSession(request({ cancellationFeePercent: 0 }), res);

    expect(capture.body).toEqual({ success: true, penaltyAmount: 5, isLate: true, needsPenaltyChoice: false });
    expect(state.writes).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not refund a package twice when two cancellations read the active lesson together', async () => {
    state.session.lesson_package_id = 'package';
    state.session.subject_id = 'maths';
    state.session.paid = true;
    const first = response();
    const second = response();
    await Promise.all([
      cancelSession(request(), first.res),
      cancelSession(request(), second.res),
    ]);

    expect([first.capture.status, second.capture.status].sort()).toEqual([200, 409]);
    expect(state.pkg.available_lessons).toBe(3);
    expect(state.item.available_lessons).toBe(3);
    expect(state.writes.filter((write) => write.values.status === 'cancelled')).toHaveLength(1);
  });

  it('rejects a retry while the original cancellation still holds the processing sentinel', async () => {
    state.session.status = 'cancelled';
    state.session.penalty_resolution = 'pending';
    const { res, capture } = response();
    await cancelSession(request(), res);

    expect(capture.status).toBe(409);
    expect(capture.body?.code).toBe('cancellation_in_progress');
    expect(state.writes).toEqual([]);
  });

  it('keeps the guard if finalization cannot be persisted', async () => {
    state.failFinalize = true;
    const { res, capture } = response();
    await cancelSession(request(), res);

    expect(capture.status).toBe(500);
    expect(state.session.penalty_resolution).toBe('pending');
    expect(state.session.cancellation_penalty_amount).toBeNull();
  });

  it('rejects credit/refund choices before the cancellation fee is finalized', async () => {
    state.session.status = 'cancelled';
    state.session.penalty_resolution = 'pending';
    state.session.paid = true;
    const { res, capture } = response();
    await resolvePenalty(request({ choice: 'credit' }), res);

    expect(capture.status).toBe(409);
    expect(capture.body?.code).toBe('cancellation_in_progress');
    expect(state.writes).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
