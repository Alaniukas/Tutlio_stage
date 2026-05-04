import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyObj = Record<string, any>;

function mockRes() {
  const headers: Record<string, string> = {};
  const out: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    status(code: number) {
      out.statusCode = code;
      return this;
    },
    json(body: any) {
      out.body = body;
      return this;
    },
    end(payload: any) {
      try {
        out.body = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch {
        out.body = payload;
      }
    },
    getResult: () => out,
    getHeaders: () => headers,
  };
}

// Supabase chain mock helper
function createChain(returnValue: any) {
  const chain: AnyObj = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => returnValue);
  chain.single = vi.fn(async () => returnValue);
  chain.update = vi.fn(() => chain);
  chain.insert = vi.fn(async () => ({ data: null, error: null }));
  return chain;
}

describe('PATCH /api/admin-organizations syncs manual payment flag', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'secret';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  });

  it('updates profiles.enable_manual_student_payments for visible tutors', async () => {
    // org before/after rows
    const orgBefore = { id: 'org1', features: { manual_payments: false } };
    const orgAfter = { id: 'org1', features: { manual_payments: true } };

    const organizationsSelect = createChain({ data: orgBefore, error: null });
    const organizationsUpdate = createChain({ data: orgAfter, error: null });
    organizationsUpdate.update = vi.fn(() => organizationsUpdate);
    organizationsUpdate.eq = vi.fn(() => organizationsUpdate);
    organizationsUpdate.select = vi.fn(() => organizationsUpdate);
    organizationsUpdate.single = vi.fn(async () => ({ data: orgAfter, error: null }));

    const profilesUpdate = createChain({ data: null, error: null });
    profilesUpdate.update = vi.fn(() => profilesUpdate);
    profilesUpdate.in = vi.fn(() => profilesUpdate);

    // Avoid brittle supabase-js builder thenable mocking: just mock the helper.
    vi.doMock('../../api/_lib/orgVisibleTutorIds.js', () => ({
      getOrgVisibleTutorProfileIds: vi.fn(async () => ['t1']),
    }));

    const from = vi.fn((table: string) => {
      if (table === 'organizations') {
        // handler does: select(...).eq(...).maybeSingle() then update(...).eq(...).select(...).single()
        return {
          select: organizationsSelect.select,
          eq: organizationsSelect.eq,
          maybeSingle: organizationsSelect.maybeSingle,
          update: organizationsUpdate.update,
        } as any;
      }
      if (table === 'profiles') {
        return {
          update: profilesUpdate.update,
          in: profilesUpdate.in,
        } as any;
      }
      if (table === 'platform_admin_audit') return { insert: vi.fn(async () => ({ data: null, error: null })) } as any;
      return {} as any;
    });

    const createClient = vi.fn(() => ({ from }));
    vi.doMock('@supabase/supabase-js', () => ({ createClient }));

    const handler = (await import('../../api/admin-organizations')).default;
    const req = {
      method: 'PATCH',
      headers: { 'x-admin-secret': 'secret' },
      query: { id: 'org1' },
      body: { features: { manual_payments: true } },
    };
    const res = mockRes();
    await handler(req as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);

    // Ensure we sync tutor profile flag based on merged feature.
    expect(profilesUpdate.update).toHaveBeenCalledWith({ enable_manual_student_payments: true });
    expect(profilesUpdate.in).toHaveBeenCalledWith('id', ['t1']);
  });
});

