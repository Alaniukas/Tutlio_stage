import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261005105541_org_calendar_availability_permissions.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY, features jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE organization_admins(user_id uuid, organization_id uuid, status text DEFAULT 'active', role text DEFAULT 'admin', permissions jsonb DEFAULT '{}');
    CREATE TABLE availability(id uuid PRIMARY KEY, tutor_id uuid, start_time time, end_time time);
    CREATE FUNCTION public.write_blocked_by_org_suspension() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('test.write_blocked', true), ''), 'false')::boolean $$;
    CREATE FUNCTION private.org_admin_permission_gate(required text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT NOT EXISTS (SELECT 1 FROM organization_admins WHERE user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM organization_admins WHERE user_id=auth.uid() AND status='active'
          AND (
            role = 'owner'
            OR EXISTS(SELECT 1 FROM unnest(required) AS permission_key WHERE permissions @> jsonb_build_object(permission_key, true))
          )) $$;
    -- Fail if the old nested profiles/organizations RLS lookup runs at all.
    CREATE FUNCTION private.unexpected_family_rls() RETURNS boolean LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Nested family RLS executed'; END $$;
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY family_profiles ON profiles FOR SELECT USING(private.unexpected_family_rls());
    CREATE POLICY family_organizations ON organizations FOR SELECT USING(private.unexpected_family_rls());
    ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
    CREATE POLICY availability_public ON availability FOR SELECT USING(true);
    CREATE POLICY availability_tutor ON availability FOR ALL TO authenticated
      USING(tutor_id=auth.uid() AND NOT write_blocked_by_org_suspension())
      WITH CHECK(tutor_id=auth.uid() AND NOT write_blocked_by_org_suspension());
    CREATE POLICY org_admin_permission_insert ON availability AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK(private.org_admin_permission_gate('{sessions.edit}'));
    CREATE POLICY org_admin_permission_update ON availability AS RESTRICTIVE FOR UPDATE TO authenticated
      USING(private.org_admin_permission_gate('{sessions.edit}'))
      WITH CHECK(private.org_admin_permission_gate('{sessions.edit}'));
    CREATE POLICY org_admin_permission_delete ON availability AS RESTRICTIVE FOR DELETE TO authenticated
      USING(private.org_admin_permission_gate('{sessions.edit}'));
    GRANT USAGE ON SCHEMA public,auth,private TO authenticated,anon;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,anon;
    INSERT INTO organizations VALUES
      ('${id(1)}','{"org_admin_calendar_full_control":true}'),
      ('${id(2)}','{}'), ('${id(3)}','{"org_admin_calendar_full_control":true}');
    INSERT INTO profiles VALUES ('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}'),('${id(13)}','${id(3)}');
    INSERT INTO organization_admins VALUES
      ('${id(21)}','${id(1)}','active','admin','{"sessions.edit":true}'),
      ('${id(21)}','${id(2)}','active','admin','{"sessions.edit":true}'),
      ('${id(22)}','${id(3)}','active','admin','{"sessions.edit":true}'),
      ('${id(23)}','${id(1)}','active','admin','{"sessions.view":true}'),
      ('${id(24)}','${id(1)}','revoked','admin','{"sessions.edit":true}'),
      ('${id(25)}','${id(1)}','active','owner','{}');
  `);
  await db.exec(migration);
}, 30_000);

beforeEach(async () => {
  await db.exec(`SELECT set_config('test.write_blocked', 'false', false); DELETE FROM availability;
    INSERT INTO availability VALUES
      ('${id(31)}','${id(11)}','18:00','20:00'),
      ('${id(32)}','${id(12)}','18:00','20:00'),
      ('${id(33)}','${id(13)}','18:00','20:00');`);
});
afterAll(async () => { await db?.close(); });

async function asUser(user: string | null, query: string, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
    return (await db.query<{ id: string }>(query)).rows;
  } finally { await db.exec('RESET ROLE'); }
}

describe('PostgreSQL organization admin availability permissions', () => {
  it('updates, inserts and deletes own org availability without entering family RLS', async () => {
    expect(await asUser(id(21), `UPDATE availability SET end_time='20:10' WHERE id='${id(31)}' RETURNING id`))
      .toEqual([{ id: id(31) }]);
    expect(await asUser(id(21), `INSERT INTO availability VALUES('${id(34)}','${id(11)}','16:00','17:00') RETURNING id`))
      .toEqual([{ id: id(34) }]);
    expect(await asUser(id(21), `DELETE FROM availability WHERE id='${id(34)}' RETURNING id`))
      .toEqual([{ id: id(34) }]);
  });

  it('denies another org and an own org without full calendar control', async () => {
    for (const n of [32, 33]) {
      expect(await asUser(id(21), `UPDATE availability SET end_time='21:00' WHERE id='${id(n)}' RETURNING id`)).toEqual([]);
      expect(await asUser(id(21), `DELETE FROM availability WHERE id='${id(n)}' RETURNING id`)).toEqual([]);
    }
    await expect(asUser(id(21), `INSERT INTO availability VALUES('${id(34)}','${id(13)}','16:00','17:00')`))
      .rejects.toThrow(/row-level security/);
  });

  it('checks the updated tutor as well as the original row', async () => {
    await expect(asUser(id(21), `UPDATE availability SET tutor_id='${id(13)}' WHERE id='${id(31)}'`))
      .rejects.toThrow(/row-level security/);
  });

  it('allows owner role with empty permissions json', async () => {
    expect(await asUser(id(25), `UPDATE availability SET end_time='20:10' WHERE id='${id(31)}' RETURNING id`))
      .toEqual([{ id: id(31) }]);
  });

  it('preserves edit permissions, membership revocation and suspension checks', async () => {
    for (const user of [23, 24]) {
      expect(await asUser(id(user), `UPDATE availability SET end_time='21:00' WHERE id='${id(31)}' RETURNING id`)).toEqual([]);
    }
    await db.exec("SELECT set_config('test.write_blocked', 'true', false)");
    expect(await asUser(id(21), `UPDATE availability SET end_time='21:00' WHERE id='${id(31)}' RETURNING id`)).toEqual([]);
  });

  it('preserves tutor self-service without granting access to other tutors', async () => {
    expect(await asUser(id(11), `UPDATE availability SET end_time='20:10' WHERE id='${id(31)}' RETURNING id`))
      .toEqual([{ id: id(31) }]);
    expect(await asUser(id(11), `UPDATE availability SET end_time='21:00' WHERE id='${id(33)}' RETURNING id`)).toEqual([]);
  });

  it('returns no administrator scope without an authenticated identity and denies anonymous writes', async () => {
    expect(await asUser(null, 'SELECT private.org_admin_availability_tutor_ids() AS id')).toEqual([]);
    expect(await asUser(id(21), `UPDATE availability SET end_time='21:00' WHERE id='${id(31)}' RETURNING id`, 'anon')).toEqual([]);
    await expect(asUser(id(21), 'SELECT private.org_admin_availability_tutor_ids()', 'anon')).rejects.toThrow(/permission denied/);
  });

  it('can be reapplied without changing access', async () => {
    await db.exec(migration);
    expect(await asUser(id(21), `UPDATE availability SET end_time='20:10' WHERE id='${id(31)}' RETURNING id`))
      .toEqual([{ id: id(31) }]);
  });
});
