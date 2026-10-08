import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261008123306_tutor_environment_accounts.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

async function asRole<T>(role: string, run: () => Promise<T>) {
  await db.exec(`SET ROLE ${role}`);
  try { return await run(); } finally { await db.exec('RESET ROLE'); }
}
const link = (a: number, b: number) => asRole('service_role', () => db.query('SELECT public.link_tutor_environment_accounts($1, $2)', [id(a), id(b)]));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY, name text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, organization_id uuid, email text, company_commission_percent numeric);
    CREATE TABLE public.organization_admins(user_id uuid, organization_id uuid);
    CREATE TABLE public.platform_admin_audit(action text, organization_id uuid, details jsonb);
    CREATE TABLE public.sessions(id uuid PRIMARY KEY, tutor_id uuid, price numeric);
    ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tutor_sessions ON public.sessions TO authenticated USING (tutor_id = auth.uid());
    GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role, anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT ON public.sessions TO authenticated;
    INSERT INTO public.organizations VALUES ('${id(10)}', 'Company A'), ('${id(11)}', 'Company B'), ('${id(12)}', 'Company C'), ('${id(13)}', 'Company D');
    INSERT INTO public.profiles VALUES
      ('${id(1)}', '${id(10)}', 'first@example.com', 14),
      ('${id(2)}', '${id(11)}', 'second@example.com', 18),
      ('${id(3)}', '${id(12)}', 'third@example.com', 20),
      ('${id(4)}', '${id(13)}', 'fourth@example.com', 22);
    INSERT INTO public.sessions VALUES ('${id(100)}', '${id(1)}', 14), ('${id(101)}', '${id(2)}', 18);
  `);
  await db.exec(sql);
});
beforeEach(async () => {
  await db.exec('TRUNCATE public.tutor_environment_accounts, public.organization_admins, public.platform_admin_audit');
  await db.query('UPDATE public.profiles SET organization_id = $1 WHERE id = $2', [id(11), id(2)]);
});
afterAll(async () => { await db?.close(); });

describe('verified tutor environment account groups', () => {
  it('links separate logins while preserving company ownership, pay and lessons', async () => {
    await link(1, 2);
    const members = await db.query<{ identity_id: string; tutor_id: string }>('SELECT identity_id,tutor_id FROM public.tutor_environment_accounts ORDER BY tutor_id');
    expect(members.rows.map((row) => row.tutor_id)).toEqual([id(1), id(2)]);
    expect(new Set(members.rows.map((row) => row.identity_id)).size).toBe(1);
    expect((await db.query('SELECT organization_id, company_commission_percent FROM public.profiles WHERE id=$1', [id(1)])).rows).toEqual([{ organization_id: id(10), company_commission_percent: '14' }]);
    expect((await db.query('SELECT count(*)::int AS count FROM public.sessions')).rows).toEqual([{ count: 2 }]);
  });

  it('never grants a linked identity direct access to the other tutor’s lessons', async () => {
    await link(1, 2);
    for (const tutor of [1, 2]) {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(tutor)]);
      const result = await asRole('authenticated', () => db.query<{ tutor_id: string }>('SELECT tutor_id FROM public.sessions'));
      expect(result.rows).toEqual([{ tutor_id: id(tutor) }]);
    }
  });

  it('denies browser reads, writes and direct calls that forge account links', async () => {
    await link(1, 2);
    for (const role of ['anon', 'authenticated']) {
      await expect(asRole(role, () => db.query('SELECT * FROM public.tutor_environment_accounts'))).rejects.toThrow(/permission denied/);
      await expect(asRole(role, () => db.query('SELECT public.link_tutor_environment_accounts($1,$2)', [id(1), id(3)]))).rejects.toThrow(/permission denied/);
      await expect(asRole(role, () => db.query('SELECT public.unlink_tutor_environment_account($1,$2)', [id(1), id(2)]))).rejects.toThrow(/permission denied/);
      await expect(asRole(role, () => db.query('DELETE FROM public.tutor_environment_accounts'))).rejects.toThrow(/permission denied/);
    }
  });

  it('atomically merges verified account groups and supports replay without duplicates', async () => {
    await link(1, 2);
    await link(3, 4);
    await link(2, 3);
    await link(3, 2);
    const result = await db.query('SELECT count(*)::int AS accounts, count(DISTINCT identity_id)::int AS identities FROM public.tutor_environment_accounts');
    expect(result.rows).toEqual([{ accounts: 4, identities: 1 }]);
  });

  it('rejects same-company, missing and administration accounts', async () => {
    await db.query('UPDATE public.profiles SET organization_id=$1 WHERE id=$2', [id(10), id(2)]);
    await expect(link(1, 2)).rejects.toThrow(/different organizations/);
    await expect(link(1, 1)).rejects.toThrow(/different tutor accounts/);
    await expect(link(1, 99)).rejects.toThrow(/different organizations/);
    await db.query('INSERT INTO public.organization_admins VALUES($1,$2)', [id(3), id(12)]);
    await expect(link(1, 3)).rejects.toThrow(/different organizations/);
  });

  it('keeps the original company binding when a tutor is reassigned', async () => {
    await link(1, 2);
    await db.query('UPDATE public.profiles SET organization_id=$1 WHERE id=$2', [id(12), id(2)]);
    const result = await db.query('SELECT organization_id FROM public.tutor_environment_accounts WHERE tutor_id=$1', [id(2)]);
    expect(result.rows).toEqual([{ organization_id: id(11) }]);
  });

  it('unlinking only removes switching access and preserves both tutor histories', async () => {
    await link(1, 2);
    await expect(asRole('service_role', () => db.query('SELECT public.unlink_tutor_environment_account($1,$2)', [id(1), id(3)]))).rejects.toThrow(/not assigned/);
    await asRole('service_role', () => db.query('SELECT public.unlink_tutor_environment_account($1,$2)', [id(1), id(2)]));
    expect((await db.query('SELECT count(*)::int AS count FROM public.profiles')).rows).toEqual([{ count: 4 }]);
    expect((await db.query('SELECT count(*)::int AS count FROM public.sessions')).rows).toEqual([{ count: 2 }]);
    expect((await db.query('SELECT tutor_id FROM public.tutor_environment_accounts')).rows).toEqual([{ tutor_id: id(1) }]);
    expect((await db.query('SELECT action, details FROM public.platform_admin_audit')).rows).toEqual([
      { action: 'tutor_environments.assign', details: expect.objectContaining({ tutor_id: id(1), other_tutor_id: id(2), other_organization_id: id(11) }) },
      { action: 'tutor_environments.remove', details: { tutor_id: id(1), other_tutor_id: id(2) } },
    ]);
  });
});
