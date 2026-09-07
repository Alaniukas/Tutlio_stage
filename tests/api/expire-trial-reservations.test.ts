import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../../api/_lib/google-calendar', () => ({
  deleteSessionFromGoogle: vi.fn(() => Promise.resolve()),
}));

// Mutable per-test Supabase responses.
let sessionsSelect: { data: any[] | null; error: any } = { data: [], error: null };
let packagesSelect: { data: any[] | null; error: any } = { data: [], error: null };
let sessionsUpdate: { error: any } = { error: null };
let packagesUpdate: { error: any } = { error: null };
const updateCalls: { table: string; payload: any }[] = [];

function builder(table: string) {
  let isUpdate = false;
  const b: any = {
    select: () => b,
    update: (payload: any) => {
      isUpdate = true;
      updateCalls.push({ table, payload });
      return b;
    },
    eq: () => b,
    in: () => b,
    not: () => b,
    lt: () => b,
    gt: () => b,
    limit: () => b,
    then(resolve: (v: any) => any, reject: (e: any) => any) {
      let res: any;
      if (table === 'sessions') res = isUpdate ? sessionsUpdate : sessionsSelect;
      else if (table === 'lesson_packages') res = isUpdate ? packagesUpdate : packagesSelect;
      else res = { data: [], error: null };
      return Promise.resolve(res).then(resolve, reject);
    },
  };
  return b;
}

const from = vi.fn((table: string) => builder(table));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }));

import { deleteSessionFromGoogle } from '../../api/_lib/google-calendar';

function mockReq(method = 'GET', headers: Record<string, string> = {}) {
  return { method, headers, body: {}, query: {} } as any;
}

function mockRes() {
  const out: { statusCode: number; body: any } = { statusCode: 0, body: null };
  const res: any = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(body: any) {
      out.body = body;
      return res;
    },
    getResult: () => out,
  };
  return res;
}

const prevCronSecret = process.env.CRON_SECRET;
const prevVercelEnv = process.env.VERCEL_ENV;

describe('GET /api/expire-trial-reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionsSelect = { data: [], error: null };
    packagesSelect = { data: [], error: null };
    sessionsUpdate = { error: null };
    packagesUpdate = { error: null };
    updateCalls.length = 0;
    // Local-dev mode (no CRON_SECRET, no VERCEL_ENV) authorizes by default.
    delete process.env.CRON_SECRET;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (prevCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCronSecret;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
  });

  it('rejects unsupported methods with 405', async () => {
    const handler = (await import('../../api/expire-trial-reservations')).default;
    const res = mockRes();
    await handler(mockReq('PUT'), res);
    expect(res.getResult().statusCode).toBe(405);
  });

  it('rejects a wrong cron secret with 401', async () => {
    process.env.CRON_SECRET = 'right-secret';
    const handler = (await import('../../api/expire-trial-reservations')).default;
    const res = mockRes();
    await handler(mockReq('GET', { authorization: 'Bearer wrong' }), res);
    expect(res.getResult().statusCode).toBe(401);
  });

  it('returns 500 when the holds query errors', async () => {
    sessionsSelect = { data: null, error: { message: 'boom' } };
    const handler = (await import('../../api/expire-trial-reservations')).default;
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res.getResult().statusCode).toBe(500);
    expect(res.getResult().body.error).toBe('boom');
  });

  it('reports nothing released when there are no expired holds', async () => {
    sessionsSelect = { data: [], error: null };
    const handler = (await import('../../api/expire-trial-reservations')).default;
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res.getResult().statusCode).toBe(200);
    expect(res.getResult().body).toEqual({ released: 0, packagesExpired: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it('cancels expired unpaid holds and deactivates their trial packages', async () => {
    sessionsSelect = {
      data: [
        { id: 'sess-1', tutor_id: 'tutor-1', lesson_package_id: 'pkg-1', start_time: '2026-01-01T00:00:00Z' },
        { id: 'sess-2', tutor_id: 'tutor-2', lesson_package_id: 'pkg-2', start_time: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    };
    packagesSelect = {
      data: [
        { id: 'pkg-1', paid: false },
        { id: 'pkg-2', paid: false },
      ],
      error: null,
    };

    const handler = (await import('../../api/expire-trial-reservations')).default;
    const res = mockRes();
    await handler(mockReq('GET'), res);

    const result = res.getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ released: 2, packagesExpired: 2 });

    const sessionUpdate = updateCalls.find((c) => c.table === 'sessions');
    expect(sessionUpdate?.payload).toMatchObject({ status: 'cancelled', payment_status: 'expired' });
    const pkgUpdate = updateCalls.find((c) => c.table === 'lesson_packages');
    expect(pkgUpdate?.payload).toMatchObject({ active: false, payment_status: 'expired' });

    expect(deleteSessionFromGoogle).toHaveBeenCalledTimes(2);
  });

  it('never releases a hold whose package was already paid (late-webhook safety net)', async () => {
    sessionsSelect = {
      data: [{ id: 'sess-1', tutor_id: 'tutor-1', lesson_package_id: 'pkg-1', start_time: '2026-01-01T00:00:00Z' }],
      error: null,
    };
    packagesSelect = { data: [{ id: 'pkg-1', paid: true }], error: null };

    const handler = (await import('../../api/expire-trial-reservations')).default;
    const res = mockRes();
    await handler(mockReq('GET'), res);

    expect(res.getResult().statusCode).toBe(200);
    expect(res.getResult().body).toEqual({ released: 0, packagesExpired: 0 });
    expect(updateCalls).toHaveLength(0);
    expect(deleteSessionFromGoogle).not.toHaveBeenCalled();
  });
});
