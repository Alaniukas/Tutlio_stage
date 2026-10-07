// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261007092500_whiteboard_storage_session_lookup.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scene = `${id(31)}/scene.json`;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE organization_admins(user_id uuid, organization_id uuid, status text, can_view boolean, can_edit boolean);
    CREATE TABLE students(id uuid PRIMARY KEY, tutor_id uuid, linked_user_id uuid);
    CREATE TABLE sessions(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid);
    CREATE TABLE storage.objects(bucket_id text, name text, metadata text, PRIMARY KEY(bucket_id,name));
    CREATE SEQUENCE private.scope_checks;
    CREATE FUNCTION private.check_session_scope(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT nextval('private.scope_checks') > 0 AND current_setting('test.deny_scope',true) IS DISTINCT FROM 'true';
    $$;
    CREATE FUNCTION private.org_admin_permission_gate(p_write boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path='' AS $$
      SELECT NOT EXISTS(SELECT 1 FROM public.organization_admins WHERE user_id=auth.uid())
        OR EXISTS(SELECT 1 FROM public.organization_admins WHERE user_id=auth.uid() AND status='active'
          AND CASE WHEN p_write THEN can_edit ELSE can_view OR can_edit END);
    $$;
    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY session_roles ON sessions FOR SELECT TO authenticated USING(
      tutor_id=auth.uid() OR student_id IN(SELECT id FROM students WHERE linked_user_id=auth.uid())
      OR tutor_id IN(SELECT p.id FROM profiles p JOIN organization_admins a ON a.organization_id=p.organization_id WHERE a.user_id=auth.uid()));
    CREATE POLICY school_family_session_read_scope ON sessions AS RESTRICTIVE FOR SELECT TO authenticated
      USING(private.check_session_scope(student_id));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY org_admin_permission_domain_files_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
      USING(private.org_admin_permission_gate(false));
    CREATE POLICY org_admin_permission_domain_files_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK(private.org_admin_permission_gate(true));
    CREATE POLICY org_admin_permission_domain_files_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
      USING(private.org_admin_permission_gate(true)) WITH CHECK(private.org_admin_permission_gate(true));
    GRANT USAGE ON SCHEMA public,auth,private,storage TO authenticated,anon;
    GRANT SELECT ON sessions,students,profiles,organization_admins TO authenticated,anon;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon;
    GRANT USAGE,SELECT ON SEQUENCE private.scope_checks TO authenticated;
    INSERT INTO profiles VALUES('${id(11)}','${id(1)}'),('${id(12)}','${id(1)}'),('${id(13)}','${id(2)}');
    INSERT INTO organization_admins VALUES
      ('${id(21)}','${id(1)}','active',true,true),
      ('${id(22)}','${id(2)}','active',true,true),
      ('${id(23)}','${id(1)}','revoked',true,true),
      ('${id(24)}','${id(1)}','active',false,false);
    INSERT INTO students VALUES('${id(41)}','${id(11)}','${id(51)}'),('${id(42)}','${id(13)}','${id(52)}');
    INSERT INTO sessions VALUES('${id(31)}','${id(11)}','${id(41)}'),('${id(32)}','${id(13)}','${id(42)}');
    INSERT INTO sessions SELECT ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'${id(13)}','${id(42)}'
      FROM generate_series(1,3000) n;
    ANALYZE sessions;
  `);
  await db.exec(migration);
}, 30_000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; SELECT set_config('test.deny_scope','false',false);
    DELETE FROM storage.objects; ALTER SEQUENCE private.scope_checks RESTART WITH 1;
    INSERT INTO storage.objects VALUES('whiteboard-data','${scene}','original'),('whiteboard-data','${id(32)}/scene.json','other org');`);
});
afterAll(async () => { await db?.close(); });

async function asUser(user: string | null, query: string, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query("SELECT set_config('test.uid',$1,false)", [user ?? '']);
    return (await db.query(query)).rows;
  } finally { await db.exec('RESET ROLE'); }
}
const readScene = `SELECT metadata FROM storage.objects WHERE bucket_id='whiteboard-data' AND name='${scene}'`;
const writeScene = (path = scene) => `INSERT INTO storage.objects VALUES('whiteboard-data','${path}','saved')
  ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=excluded.metadata RETURNING metadata`;

describe('whiteboard Storage session lookups', () => {
  it('lets the assigned tutor read, create and replace the scene and its assets', async () => {
    expect(await asUser(id(11), readScene)).toEqual([{ metadata: 'original' }]);
    expect(await asUser(id(11), writeScene())).toEqual([{ metadata: 'saved' }]);
    expect(await asUser(id(11), writeScene(`${id(31)}/files/image.json`))).toEqual([{ metadata: 'saved' }]);
    expect(await asUser(id(11), writeScene(`${id(31)}/files/image.json`))).toEqual([{ metadata: 'saved' }]);
  });

  it('keeps student access limited to their own lesson', async () => {
    expect(await asUser(id(51), readScene)).toEqual([{ metadata: 'original' }]);
    expect(await asUser(id(51), writeScene())).toEqual([{ metadata: 'saved' }]);
    expect(await asUser(id(52), readScene)).toEqual([]);
    await expect(asUser(id(52), writeScene())).rejects.toThrow(/row-level security/);
  });

  it('keeps org admins read-only and enforces revoked seats and permissions', async () => {
    expect(await asUser(id(21), readScene)).toEqual([{ metadata: 'original' }]);
    await expect(asUser(id(21), writeScene())).rejects.toThrow(/row-level security/);
    for (const caller of [id(22), id(23), id(24), id(12), null]) {
      expect(await asUser(caller, readScene)).toEqual([]);
      await expect(asUser(caller, writeScene())).rejects.toThrow(/row-level security/);
    }
    expect(await asUser(null, readScene, 'anon')).toEqual([]);
  });

  it('preserves the underlying session scope restrictions', async () => {
    await db.exec("SELECT set_config('test.deny_scope','true',false)");
    expect(await asUser(id(11), readScene)).toEqual([]);
    await expect(asUser(id(11), writeScene())).rejects.toThrow(/row-level security/);
  });

  it('denies malformed paths, unknown sessions and different buckets', async () => {
    for (const path of ['invalid/scene.json', 'scene.json', `${id(9999)}/scene.json`]) {
      await expect(asUser(id(11), writeScene(path))).rejects.toThrow(/row-level security/);
    }
    await expect(asUser(id(11), `INSERT INTO storage.objects VALUES('invoices','${scene}','private')`)).rejects.toThrow(/row-level security/);
    expect((await db.query("SELECT private.whiteboard_object_session_id('invalid/scene.json') AS id")).rows).toEqual([{ id: null }]);
  });

  it('checks only the referenced session instead of entering family RLS for thousands of unrelated lessons', async () => {
    expect(await asUser(id(11), readScene)).toEqual([{ metadata: 'original' }]);
    const checks = (await db.query<{ last_value: number }>('SELECT last_value FROM private.scope_checks')).rows[0].last_value;
    expect(Number(checks)).toBeLessThan(10);
    const plan = await asUser(id(11), `EXPLAIN SELECT id FROM sessions WHERE id=private.whiteboard_object_session_id('${scene}') AND tutor_id=auth.uid()`);
    expect(JSON.stringify(plan)).toContain('sessions_pkey');
  });
});
