import { beforeEach, describe, expect, it, vi } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const state = vi.hoisted(() => ({
  users: {} as Record<string, any>, profiles: [] as any[], organizations: [] as any[], admins: [] as any[],
  memberships: [] as any[],
  signIns: [] as any[], signOuts: [] as any[], linkCalls: [] as any[],
  generated: [] as any[], verified: [] as any[], authId: '', authError: false,
  generatedUserId: null as string | null, handoffUserId: null as string | null,
  deleted: [] as string[], mutationTables: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => ({
    auth: {
      getUser: async () => ({ data: { user: state.users[state.authId] }, error: state.authError ? {} : null }),
      signInWithPassword: async (credentials: any) => {
        state.signIns.push(credentials);
        const user = Object.values(state.users).find((row) => row.email === credentials.email && credentials.password === 'correct-password');
        return { data: { user: user || null, session: user ? { access_token: 'temporary' } : null }, error: user ? null : {} };
      },
      signOut: async (options: any) => { state.signOuts.push(options); return { error: null }; },
      verifyOtp: async (input: any) => {
        state.verified.push(input);
        const targetId = state.handoffUserId || state.generatedUserId || Object.values(state.users).find((row) => row.email === state.generated.at(-1)?.email)?.id;
        return { data: { user: state.users[targetId], session: { access_token: 'target-access', refresh_token: 'target-refresh' } }, error: null };
      },
      admin: {
        getUserById: async (userId: string) => ({ data: { user: state.users[userId] }, error: null }),
        generateLink: async (input: any) => {
          expect(key).toBe('service-key');
          state.generated.push(input);
          const target = Object.values(state.users).find((row) => row.email === input.email);
          return { data: { user: state.users[state.generatedUserId || target.id], properties: { hashed_token: 'one-use-token' } }, error: null };
        },
      },
    },
    rpc: async (name: string, args: any) => {
      state.linkCalls.push({ name, args });
      if (name === 'unlink_tutor_environment_account') {
        state.memberships = state.memberships.filter(row => row.tutor_id !== args.p_other_tutor_id);
        return { error: null };
      }
      const group = 'verified-identity';
      for (const userId of [args.p_tutor_id, args.p_other_tutor_id]) {
        const profile = state.profiles.find((row) => row.id === userId);
        state.memberships.push({ tutor_id: userId, identity_id: group, organization_id: profile.organization_id });
      }
      return { error: null };
    },
    from: (table: string) => {
      const filters: Array<[string, any]> = [];
      let deletion = false;
      let cap = Infinity;
      const rows = () => {
        const source = table === 'profiles' ? state.profiles : table === 'organizations' ? state.organizations : table === 'organization_admins' ? state.admins : state.memberships;
        return source.filter((row) => filters.every(([key, value]) => row[key] === value)).slice(0, cap);
      };
      const result = () => {
        const data = rows();
        if (deletion) {
          data.forEach((row) => state.deleted.push(row.tutor_id));
          state.memberships = state.memberships.filter((row) => !data.includes(row));
        }
        return { data, error: null };
      };
      const query: any = {
        select: () => query,
        eq: (key: string, value: any) => { filters.push([key, value]); return query; },
        limit: (value: number) => { cap = value; return query; },
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        then: (resolve: any) => Promise.resolve(result()).then(resolve),
        delete: () => { deletion = true; state.mutationTables.push(table); return query; },
      };
      return query;
    },
  }),
}));

import handler from '../../api/tutor-environments';
import adminHandler from '../../api/admin-tutor-environments';

async function request(method: string, body?: Record<string, string>, authenticated = true) {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  await handler({ method, body, headers: authenticated ? { authorization: 'Bearer caller-token' } : {} } as any, response);
  return { status: response.status.mock.calls[0]?.[0], body: response.json.mock.calls[0]?.[0], response };
}
async function adminRequest(method: string, body?: Record<string, string>, secret = 'platform-secret') {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  await adminHandler({ method, body, query: { tutorId: id(1) }, headers: { 'x-admin-secret': secret } } as any, response);
  return { status: response.status.mock.calls[0]?.[0], body: response.json.mock.calls[0]?.[0] };
}
function addLinks() {
  state.memberships = [1, 2].map((n) => ({ tutor_id: id(n), organization_id: id(n + 10), identity_id: 'identity-1' }));
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  process.env.ADMIN_SECRET = 'platform-secret';
  state.users = Object.fromEntries([1, 2, 3].map((n) => [id(n), { id: id(n), email: `tutor${n}@example.com`, email_confirmed_at: '2026-01-01', factors: [] }]));
  state.profiles = [1, 2, 3].map((n) => ({ id: id(n), organization_id: id(n + 10), email: `tutor${n}@example.com` }));
  state.organizations = [11, 12, 13].map((n) => ({ id: id(n), name: `Company ${n}` }));
  state.admins = []; state.memberships = []; state.signIns = []; state.signOuts = []; state.linkCalls = [];
  state.generated = []; state.verified = []; state.deleted = []; state.mutationTables = [];
  state.authId = id(1); state.authError = false; state.generatedUserId = null; state.handoffUserId = null;
});

describe('tutor environment API', () => {
  it('rejects unauthenticated callers before exposing account names', async () => {
    const result = await request('GET', undefined, false);
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'unauthorized' });
    expect(result.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('lists only verified linked accounts, without matching by name or invitation email', async () => {
    expect((await request('GET')).body.environments.map((row: any) => row.tutorId)).toEqual([id(1)]);
    addLinks();
    expect((await request('GET')).body.environments.map((row: any) => row.tutorId)).toEqual([id(1), id(2)]);
  });

  it('labels an account using its current login email when profile contact details are stale', async () => {
    addLinks();
    state.profiles[1].email = 'old-contact@example.com';
    state.users[id(2)].email = 'current-login@example.com';
    const result = await request('GET');
    expect(result.body.environments.find((row: any) => row.tutorId === id(2)).email).toBe('current-login@example.com');
  });

  it('assigns companies through the platform admin so both logins list them by default', async () => {
    const result = await adminRequest('POST', { tutorId: id(1), otherTutorId: id(2) });
    expect(result.status).toBe(200);
    expect(state.linkCalls).toEqual([{ name: 'link_tutor_environment_accounts', args: { p_tutor_id: id(1), p_other_tutor_id: id(2) } }]);
    expect(state.signIns).toEqual([]);
    expect(state.generated).toEqual([]);
    expect(result.body.environments).toHaveLength(2);
    state.authId = id(2);
    expect((await request('GET')).body.environments).toHaveLength(2);
  });

  it('does not allow tutors to link or unlink companies, even with both passwords', async () => {
    expect((await request('POST', { action: 'link', email: 'tutor2@example.com', password: 'correct-password', currentPassword: 'correct-password' })).status).toBe(400);
    expect((await request('DELETE', { tutorId: id(2) })).status).toBe(405);
    expect(state.linkCalls).toEqual([]);
    expect(state.signIns).toEqual([]);
  });

  it.each(['', 'wrong-secret'])('rejects an assignment without valid platform admin authorization: %s', async secret => {
    expect((await adminRequest('POST', { tutorId: id(1), otherTutorId: id(2) }, secret)).status).toBe(401);
    expect(state.linkCalls).toEqual([]);
  });

  it('rejects same-company and missing accounts without creating an assignment', async () => {
    state.profiles[1].organization_id = id(11);
    expect((await adminRequest('POST', { tutorId: id(1), otherTutorId: id(2) })).body.error).toBe('sameCompany');
    expect((await adminRequest('POST', { tutorId: id(1), otherTutorId: id(99) })).body.error).toBe('notTutor');
    expect(state.linkCalls).toEqual([]);
  });

  it('does not use request-supplied tutor IDs as proof of an account link', async () => {
    const result = await request('POST', { action: 'switch', tutorId: id(2) });
    expect(result.body.error).toBe('notLinked');
    expect(state.generated).toEqual([]);
  });

  it('switches with the target auth identity and sends no invitation or email', async () => {
    addLinks();
    const result = await request('POST', { action: 'switch', tutorId: id(2) });
    expect(result.status).toBe(200);
    expect(state.generated).toEqual([{ type: 'magiclink', email: 'tutor2@example.com' }]);
    expect(state.verified).toEqual([{ token_hash: 'one-use-token', type: 'magiclink' }]);
    expect(result.body).toEqual({ tutorId: id(2), session: { access_token: 'target-access', refresh_token: 'target-refresh' } });
  });

  it('refuses links or switches into organization administration accounts', async () => {
    state.admins.push({ user_id: id(2), organization_id: id(12) });
    const result = await adminRequest('POST', { tutorId: id(1), otherTutorId: id(2) });
    expect(result.body.error).toBe('notTutor');
    expect(state.linkCalls).toEqual([]);
    addLinks();
    expect((await request('POST', { action: 'switch', tutorId: id(2) })).body.error).toBe('notLinked');
  });

  it('does not carry a verified link over to a reassigned company', async () => {
    addLinks();
    state.profiles[1].organization_id = id(13);
    expect((await request('GET')).body.environments).toHaveLength(1);
    expect((await request('POST', { action: 'switch', tutorId: id(2) })).body.error).toBe('notLinked');
    state.profiles[0].organization_id = id(13);
    expect((await request('POST', { action: 'switch', tutorId: id(2) })).body.error).toBe('notLinked');
  });

  it.each(['banned', 'unconfirmed', 'mfa'])('does not bypass %s account authentication restrictions', async (restriction) => {
    addLinks();
    if (restriction === 'banned') state.users[id(2)].banned_until = '2099-01-01';
    if (restriction === 'unconfirmed') state.users[id(2)].email_confirmed_at = null;
    if (restriction === 'mfa') state.users[id(2)].factors = [{ status: 'verified' }];
    const result = await request('POST', { action: 'switch', tutorId: id(2) });
    expect(result.status).toBe(403);
    expect(state.generated).toEqual([]);
    expect((await adminRequest('POST', { tutorId: id(1), otherTutorId: id(2) })).status).toBe(400);
  });

  it('checks the auth subject returned by Supabase before returning any session', async () => {
    addLinks();
    state.generatedUserId = id(3);
    expect((await request('POST', { action: 'switch', tutorId: id(2) })).body.error).toBe('failed');
    expect(state.verified).toEqual([]);
    state.generatedUserId = null; state.handoffUserId = id(3);
    const result = await request('POST', { action: 'switch', tutorId: id(2) });
    expect(result.body).toEqual({ error: 'failed' });
  });

  it('only the platform admin can remove an existing assignment', async () => {
    addLinks();
    expect((await adminRequest('DELETE', { tutorId: id(1), otherTutorId: id(3) })).body.error).toBe('notLinked');
    const result = await adminRequest('DELETE', { tutorId: id(1), otherTutorId: id(2) });
    expect(result.status).toBe(200);
    expect(state.linkCalls).toEqual([{ name: 'unlink_tutor_environment_account', args: { p_tutor_id: id(1), p_other_tutor_id: id(2) } }]);
    expect(state.mutationTables).toEqual([]);
    expect((await request('POST', { action: 'switch', tutorId: id(2) })).body.error).toBe('notLinked');
  });
});
