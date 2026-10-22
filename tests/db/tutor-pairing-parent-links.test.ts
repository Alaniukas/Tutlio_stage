// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION public.write_blocked_by_org_suspension() RETURNS boolean LANGUAGE sql AS $$
      SELECT COALESCE(NULLIF(current_setting('test.write_blocked',true),''),'false')::boolean $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_app_meta_data jsonb DEFAULT '{}',
      raw_user_meta_data jsonb DEFAULT '{}', email_confirmed_at timestamptz, last_sign_in_at timestamptz);
    CREATE TABLE organizations(id uuid PRIMARY KEY, features jsonb DEFAULT '{}');
    CREATE TABLE organization_admins(user_id uuid,organization_id uuid,status text,
      accepted_at timestamptz,role text,permissions jsonb);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),
      tutor_id uuid,full_name text,email text,payer_email text,linked_user_id uuid REFERENCES auth.users(id),
      parent_user_id uuid REFERENCES auth.users(id),created_at timestamptz DEFAULT now(),
      detached_at timestamptz,enrollment_status text DEFAULT 'active');
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id));
    CREATE TABLE parent_students(parent_id uuid REFERENCES parent_profiles(id),
      student_id uuid REFERENCES students(id) ON DELETE CASCADE,PRIMARY KEY(parent_id,student_id));
    CREATE TABLE sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,status text,start_time timestamptz);
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/20261013153130_student_registration_monitoring.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261015083453_preserve_tutor_pairing_parent_links.sql','utf8'));
}, 30_000);

afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    SELECT set_config('test.write_blocked','false',false);
    TRUNCATE student_registration_reminders,sessions,parent_students,parent_profiles,students,organization_admins,organizations,auth.users CASCADE;
    INSERT INTO organizations(id) VALUES ('${id(1)}'),('${id(2)}');
    INSERT INTO auth.users(id,raw_app_meta_data,email_confirmed_at,last_sign_in_at) VALUES
      ('${id(31)}','{"provisioned_by_organization":"${id(1)}"}',now(),null),
      ('${id(32)}','{}',now(),now()),('${id(33)}','{}',now(),now()),
      ('${id(35)}','{}',now(),now());
    INSERT INTO parent_profiles VALUES ('${id(41)}','${id(32)}'),('${id(42)}','${id(33)}');
    INSERT INTO organization_admins VALUES
      ('${id(51)}','${id(1)}','active',now(),'admin','{"students.edit":true}'),
      ('${id(52)}','${id(1)}','active',now(),'admin','{"students.view":true}'),
      ('${id(53)}','${id(2)}','active',now(),'owner','{}'),
      ('${id(54)}','${id(1)}','revoked',now(),'owner','{}'),
      ('${id(55)}','${id(1)}','active',now(),'owner','{}'),
      ('${id(56)}','${id(1)}','active',null,'owner','{}'),
      ('${id(57)}','${id(1)}','active',now(),'admin','{"sessions.edit":true}');
    INSERT INTO students(id,organization_id,tutor_id,full_name,email,payer_email,linked_user_id,parent_user_id) VALUES
      ('${id(11)}','${id(1)}','${id(21)}','Denas','placeholder@example.test','payer@example.test','${id(31)}','${id(32)}'),
      ('${id(12)}','${id(1)}','${id(22)}','Denas','placeholder@example.test','payer@example.test','${id(31)}',null),
      ('${id(13)}','${id(2)}','${id(23)}','Denas','placeholder@example.test','payer@example.test','${id(31)}','${id(33)}'),
      ('${id(14)}','${id(1)}','${id(24)}','Gabija','placeholder@example.test','payer@example.test','${id(31)}','${id(33)}'),
      ('${id(15)}','${id(1)}','${id(25)}','Denas','placeholder@example.test','payer@example.test','${id(35)}','${id(33)}');
    INSERT INTO parent_students VALUES
      ('${id(41)}','${id(11)}'),('${id(42)}','${id(13)}'),('${id(42)}','${id(14)}'),('${id(42)}','${id(15)}');
  `);
});

async function copy(source = id(11), target = id(12), user: string | null = id(51), role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user || '']);
    await db.query('SELECT public.copy_student_parent_links_for_tutor_pairing($1,$2)',[source,target]);
  } finally { await db.exec('RESET ROLE'); }
}

async function family(student = id(12)) {
  return (await db.query<{ parent_user_id: string | null; parents: string[] }>(`
    SELECT s.parent_user_id,ARRAY(SELECT parent_id::text FROM parent_students WHERE student_id=s.id ORDER BY parent_id) AS parents
    FROM students s WHERE s.id=$1`,[student])).rows[0];
}

async function pending(student = id(12)) {
  return (await db.query<{ registration_pending: boolean }>(`
    SELECT registration_pending FROM org_student_registration_states($1,null) WHERE student_id=$2`,[id(1),student])).rows[0].registration_pending;
}

describe('parent links across tutor assignments', () => {
  it('preserves the signed-in parent and clears pending registration on a new tutor assignment', async () => {
    expect(await pending()).toBe(true);
    await copy();
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41)] });
    expect(await pending()).toBe(false);
    expect(await family(id(11))).toEqual(await family());
  });

  it('copies both explicitly linked guardians without replacing the primary parent', async () => {
    await db.exec(`INSERT INTO parent_students VALUES ('${id(42)}','${id(11)}')`);
    await copy();
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41),id(42)] });
  });

  it('preserves parent-only registration when the legacy parent pointer is absent', async () => {
    await db.exec(`UPDATE students SET parent_user_id=null WHERE id='${id(11)}'`);
    await copy();
    expect(await family()).toEqual({ parent_user_id: null,parents: [id(41)] });
    expect(await pending()).toBe(false);
  });

  it('restores the link-table entry when only the verified parent pointer exists', async () => {
    await db.exec(`DELETE FROM parent_students WHERE student_id='${id(11)}'`);
    await copy();
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41)] });
  });

  it('recovers from an incomplete selected assignment through the same actual child account', async () => {
    await copy(id(12),id(12));
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41)] });
    expect(await pending()).toBe(false);
  });

  it('keeps access after changing tutors and removing the old assignment', async () => {
    await copy();
    await db.exec(`UPDATE students SET tutor_id='${id(26)}' WHERE id='${id(12)}'; DELETE FROM students WHERE id='${id(11)}'`);
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41)] });
    expect(await pending()).toBe(false);
  });

  it('preserves an explicitly shared parent/student account when the old tutor card is removed', async () => {
    await db.exec(`UPDATE students SET linked_user_id='${id(32)}',email='parent@example.test'
      WHERE id IN ('${id(11)}','${id(12)}')`);
    await copy();
    await db.exec(`DELETE FROM students WHERE id='${id(11)}'`);
    expect(await family()).toEqual({ parent_user_id:id(32),parents:[id(41)] });
    const student = await db.query('SELECT linked_user_id FROM students WHERE id=$1',[id(12)]);
    expect(student.rows[0].linked_user_id).toBe(id(32));
    expect(await pending()).toBe(false);
  });

  it('is idempotent when an existing tutor assignment is reused', async () => {
    await copy();
    await copy();
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41)] });
  });

  it('supports a pre-login child with no student email', async () => {
    await db.exec(`UPDATE students SET linked_user_id=null,email=null WHERE id IN ('${id(11)}','${id(12)}')`);
    await copy();
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41)] });
  });

  it('ignores siblings, another organization and a different account sharing the name and placeholder email', async () => {
    await copy();
    expect(await family()).toEqual({ parent_user_id: id(32),parents: [id(41)] });
    expect(await family(id(13))).toEqual({ parent_user_id: id(33),parents: [id(42)] });
    expect(await family(id(14))).toEqual({ parent_user_id: id(33),parents: [id(42)] });
    expect(await family(id(15))).toEqual({ parent_user_id: id(33),parents: [id(42)] });
  });

  it('rejects conflicting primary parents without overwriting either family', async () => {
    await db.exec(`UPDATE students SET parent_user_id='${id(33)}' WHERE id='${id(12)}'`);
    await expect(copy()).rejects.toThrow(/conflicting parent accounts/);
    expect(await family()).toEqual({ parent_user_id: id(33),parents: [] });
    expect(await family(id(11))).toEqual({ parent_user_id: id(32),parents: [id(41)] });
  });

  it('rolls back the parent pointer too if copying link-table entries fails', async () => {
    await db.exec(`CREATE FUNCTION reject_test_parent_link() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'parent link write failed'; END $$;
      CREATE TRIGGER reject_test_parent_link BEFORE INSERT ON parent_students FOR EACH ROW EXECUTE FUNCTION reject_test_parent_link()`);
    try {
      await expect(copy()).rejects.toThrow(/parent link write failed/);
      expect(await family()).toEqual({ parent_user_id: null,parents: [] });
    } finally {
      await db.exec('DROP TRIGGER reject_test_parent_link ON parent_students; DROP FUNCTION reject_test_parent_link()');
    }
  });

  it('rejects another child or conflicting student accounts even when the payer contact is identical', async () => {
    for (const target of [id(14),id(15)]) {
      await expect(copy(id(11),target)).rejects.toThrow(/same child/);
      expect(await family(target)).toEqual({ parent_user_id: id(33),parents: [id(42)] });
    }
    await db.exec(`UPDATE students SET linked_user_id=null,email='other-child@example.test',parent_user_id=null WHERE id='${id(12)}'`);
    await expect(copy()).rejects.toThrow(/same child/);
  });

  it('denies foreign, read-only, revoked, unaccepted and unauthenticated callers', async () => {
    for (const user of [id(52),id(53),id(54),id(56),id(31),null]) {
      await expect(copy(id(11),id(12),user)).rejects.toThrow(/permission/);
      expect(await family()).toEqual({ parent_user_id: null,parents: [] });
    }
    await expect(copy(id(11),id(13))).rejects.toThrow(/permission/);
    await expect(copy(id(11),id(12),null,'anon')).rejects.toThrow(/permission denied/);
  });

  it('allows an active owner while respecting organization suspension', async () => {
    await db.exec("SELECT set_config('test.write_blocked','true',false)");
    await expect(copy(id(11),id(12),id(55))).rejects.toThrow(/permission/);
    await db.exec("SELECT set_config('test.write_blocked','false',false)");
    await copy(id(11),id(12),id(55));
    expect(await pending()).toBe(false);
  });

  it('lets schedulers preserve an existing child account without granting student editing', async () => {
    await copy(id(11),id(12),id(57));
    expect(await pending()).toBe(false);
    await copy(id(12),id(12),id(57));
    await db.exec(`UPDATE students SET linked_user_id=null,parent_user_id=null WHERE id='${id(12)}'`);
    await expect(copy(id(11),id(12),id(57))).rejects.toThrow(/permission/);
  });

  it('does not grant browser roles general access to write parent links', async () => {
    await db.exec('SET ROLE authenticated');
    try {
      await expect(db.exec(`INSERT INTO parent_students VALUES ('${id(41)}','${id(12)}')`)).rejects.toThrow(/permission denied/);
    } finally { await db.exec('RESET ROLE'); }
  });
});
