// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261016151444_enforce_active_auth_sessions.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

type Claims = { sub?: string; session_id?: string | null; role?: string; user_metadata?: Record<string, unknown> };
const liveA: Claims = { sub: id(1), session_id: id(11), role: 'authenticated' };
const liveB: Claims = { sub: id(1), session_id: id(12), role: 'authenticated' };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA realtime;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY, full_name text);
    CREATE TABLE server_only(id uuid PRIMARY KEY);
    CREATE TABLE public_pages(id uuid PRIMARY KEY);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY, owner_id uuid, name text);
    CREATE TABLE storage.buckets(id uuid PRIMARY KEY);
    CREATE TABLE realtime.messages(id uuid PRIMARY KEY, owner_id uuid);
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE server_only ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public_pages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_profile ON profiles FOR ALL TO authenticated
      USING(id=auth.uid()) WITH CHECK(id=auth.uid());
    CREATE POLICY public_pages_read ON public_pages FOR SELECT USING(true);
    CREATE POLICY own_file ON storage.objects FOR ALL TO authenticated
      USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
    CREATE POLICY bucket_read ON storage.buckets FOR SELECT TO authenticated USING(true);
    CREATE POLICY own_channel ON realtime.messages FOR ALL TO authenticated
      USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
    CREATE FUNCTION public.definer_profile() RETURNS SETOF profiles LANGUAGE sql SECURITY DEFINER
      SET search_path='' AS $$ SELECT * FROM public.profiles WHERE id=auth.uid() $$;
    GRANT USAGE ON SCHEMA public,auth,storage,realtime TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,storage,realtime TO authenticated,service_role;
    GRANT SELECT ON public_pages TO anon;
  `);
  await db.exec(migration);
}, 30_000);

beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    SELECT set_config('request.jwt.claims','{}',false);
    TRUNCATE auth.sessions, profiles, server_only, public_pages, storage.objects, storage.buckets, realtime.messages;
    INSERT INTO auth.sessions VALUES ('${id(11)}','${id(1)}',NULL),('${id(12)}','${id(1)}',NULL),('${id(21)}','${id(2)}',NULL);
    INSERT INTO profiles VALUES ('${id(1)}','User one'),('${id(2)}','User two');
    INSERT INTO server_only VALUES ('${id(1)}');
    INSERT INTO public_pages VALUES ('${id(1)}');
    INSERT INTO storage.objects VALUES ('${id(31)}','${id(1)}','own-file'),('${id(32)}','${id(2)}','other-file');
    INSERT INTO storage.buckets VALUES ('${id(41)}');
    INSERT INTO realtime.messages VALUES ('${id(51)}','${id(1)}');
  `);
});

afterAll(async () => { await db?.close(); });

async function asCaller<T = { id: string }>(claims: Claims, sql: string, role = 'authenticated') {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.exec(sql)).at(-1)?.rows as T[]; }
  finally { await db.exec('RESET ROLE'); }
}

async function revokeB() {
  // This is the auth.sessions deletion observed during the live password test.
  await db.exec(`DELETE FROM auth.sessions WHERE id='${id(12)}'`);
}

describe('active Supabase session enforcement', () => {
  it('allows a live session and preserves profile ownership', async () => {
    expect(await asCaller(liveA, 'SELECT id FROM profiles')).toEqual([{ id: id(1) }]);
    expect(await asCaller(liveA, `UPDATE profiles SET full_name='Updated' WHERE id='${id(1)}' RETURNING id`))
      .toEqual([{ id: id(1) }]);
    expect(await asCaller(liveA, `UPDATE profiles SET full_name='Wrong user' WHERE id='${id(2)}' RETURNING id`)).toEqual([]);
  });

  it('blocks reads, updates and deletes by the old JWT immediately after revocation', async () => {
    expect(await asCaller(liveB, 'SELECT id FROM profiles')).toEqual([{ id: id(1) }]);
    await revokeB();
    expect(await asCaller(liveB, 'SELECT id FROM profiles')).toEqual([]);
    expect(await asCaller(liveB, `UPDATE profiles SET full_name='Stale' RETURNING id`)).toEqual([]);
    expect(await asCaller(liveB, 'DELETE FROM profiles RETURNING id')).toEqual([]);
    expect((await db.query('SELECT full_name FROM profiles ORDER BY id')).rows)
      .toEqual([{ full_name: 'User one' }, { full_name: 'User two' }]);
  });

  it('blocks inserts by a revoked session while the changing session keeps working', async () => {
    await revokeB();
    await expect(asCaller(liveB, `INSERT INTO storage.objects VALUES ('${id(33)}','${id(1)}','blocked')`))
      .rejects.toThrow(/row-level security/);
    expect(await asCaller(liveA, `INSERT INTO storage.objects VALUES ('${id(33)}','${id(1)}','allowed') RETURNING id`))
      .toEqual([{ id: id(33) }]);
    expect(await asCaller(liveA, 'SELECT id FROM profiles')).toEqual([{ id: id(1) }]);
  });

  it.each([
    { sub: id(1), role: 'authenticated' },
    { sub: id(1), session_id: '', role: 'authenticated' },
    { sub: id(1), session_id: 'invalid', role: 'authenticated' },
    { sub: 'invalid', session_id: id(11), role: 'authenticated' },
    { session_id: id(11), role: 'authenticated' },
    { sub: id(1), session_id: id(99), role: 'authenticated' },
    { sub: id(1), session_id: id(21), role: 'authenticated' },
  ])('rejects missing, malformed, removed and borrowed sessions: %j', async claims => {
    expect(await asCaller(claims, 'SELECT private.has_active_auth_session() AS active')).toEqual([{ active: false }]);
    await expect(asCaller(claims, 'SELECT public.enforce_active_auth_session()'))
      .rejects.toMatchObject({ code: 'PGRST', message: expect.stringContaining('session_not_found') });
  });

  it('does not trust user-editable metadata to restore a session', async () => {
    await revokeB();
    const claims = { ...liveB, user_metadata: { role: 'service_role', session_id: id(11), is_admin: true } };
    expect(await asCaller(claims, 'SELECT id FROM profiles')).toEqual([]);
    await expect(asCaller(claims, 'SELECT public.enforce_active_auth_session()')).rejects.toThrow(/session_not_found/);
  });

  it('rejects sessions whose not_after has passed', async () => {
    await db.exec(`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='${id(12)}'`);
    expect(await asCaller(liveB, 'SELECT id FROM profiles')).toEqual([]);
    await db.exec(`UPDATE auth.sessions SET not_after=now()+interval '1 hour' WHERE id='${id(12)}'`);
    expect(await asCaller(liveB, 'SELECT id FROM profiles')).toEqual([{ id: id(1) }]);
  });

  it('rejects revoked sessions before SECURITY DEFINER RPCs can bypass table policies', async () => {
    await revokeB();
    // The unguarded definer still bypasses RLS, so the PostgREST hook is required.
    expect(await asCaller(liveB, 'SELECT id FROM public.definer_profile()')).toEqual([{ id: id(1) }]);
    await expect(asCaller(liveB, 'SELECT public.enforce_active_auth_session(); SELECT id FROM public.definer_profile()'))
      .rejects.toThrow(/session_not_found/);
    expect(await asCaller(liveA, 'SELECT public.enforce_active_auth_session()')).toHaveLength(1);
    const settings = await db.query<{ rolconfig: string[] }>("SELECT rolconfig FROM pg_roles WHERE rolname='authenticator'");
    expect(settings.rows[0].rolconfig).toContain('pgrst.db_pre_request=public.enforce_active_auth_session');
  });

  it('blocks private file access and new channel authorizations outside PostgREST', async () => {
    expect(await asCaller(liveB, 'SELECT id FROM storage.objects')).toEqual([{ id: id(31) }]);
    expect(await asCaller(liveB, 'SELECT id FROM storage.buckets')).toEqual([{ id: id(41) }]);
    expect(await asCaller(liveB, 'SELECT id FROM realtime.messages')).toEqual([{ id: id(51) }]);
    await revokeB();
    expect(await asCaller(liveB, 'SELECT id FROM storage.objects')).toEqual([]);
    expect(await asCaller(liveB, 'SELECT id FROM storage.buckets')).toEqual([]);
    expect(await asCaller(liveB, 'SELECT id FROM realtime.messages')).toEqual([]);
    await expect(asCaller(liveB, `INSERT INTO realtime.messages VALUES ('${id(52)}','${id(1)}')`)).rejects.toThrow(/row-level security/);
  });

  it('preserves anonymous public pages without granting anon access to private helpers', async () => {
    expect(await asCaller({}, 'SELECT id FROM public_pages', 'anon')).toEqual([{ id: id(1) }]);
    expect(await asCaller({}, 'SELECT public.enforce_active_auth_session()', 'anon')).toHaveLength(1);
    await expect(asCaller({}, 'SELECT private.has_active_auth_session()', 'anon')).rejects.toThrow(/permission denied/);
    await expect(asCaller({}, 'SELECT id FROM auth.sessions')).rejects.toThrow(/permission denied/);
  });

  it('preserves service-role jobs without user JWT claims', async () => {
    expect(await asCaller({}, 'SELECT public.enforce_active_auth_session()', 'service_role')).toHaveLength(1);
    expect(await asCaller({}, 'SELECT id FROM profiles ORDER BY id', 'service_role')).toEqual([{ id: id(1) }, { id: id(2) }]);
    expect(await asCaller({}, `UPDATE profiles SET full_name='Server job' RETURNING id`, 'service_role')).toHaveLength(2);
  });

  it('does not grant any access to tables that have no permissive policy', async () => {
    expect(await asCaller(liveA, 'SELECT id FROM server_only')).toEqual([]);
    await expect(asCaller(liveA, `INSERT INTO server_only VALUES ('${id(2)}')`)).rejects.toThrow(/row-level security/);
  });

  it('uses a statement InitPlan for the session lookup', async () => {
    const plan = await asCaller<{ 'QUERY PLAN': string }>(liveA, 'EXPLAIN SELECT * FROM profiles');
    expect(plan.map(row => row['QUERY PLAN']).join('\n')).toContain('InitPlan');
  });

  it('can be reapplied without changing permissions or duplicating policies', async () => {
    await db.exec(migration);
    expect(await asCaller(liveA, 'SELECT id FROM profiles')).toEqual([{ id: id(1) }]);
    const policies = await db.query("SELECT policyname FROM pg_policies WHERE policyname='require_active_auth_session'");
    expect(policies.rows).toHaveLength(6);
  });

  it('refuses to overwrite an existing pre-request hook', async () => {
    await db.exec("ALTER ROLE authenticator SET pgrst.db_pre_request='public.existing_hook'");
    try { await expect(db.exec(migration)).rejects.toThrow(/existing PostgREST pre-request hook/); }
    finally { await db.exec("ALTER ROLE authenticator SET pgrst.db_pre_request='public.enforce_active_auth_session'"); }
  });
});
