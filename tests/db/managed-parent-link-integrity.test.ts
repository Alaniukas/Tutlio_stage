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
    CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}',email_confirmed_at timestamptz,last_sign_in_at timestamptz);
    CREATE TABLE organizations(id uuid PRIMARY KEY,features jsonb DEFAULT '{}');
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,tutor_id uuid,full_name text,email text,
      linked_user_id uuid REFERENCES auth.users(id),parent_user_id uuid REFERENCES auth.users(id),
      detached_at timestamptz,enrollment_status text DEFAULT 'active',created_at timestamptz DEFAULT now());
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),full_name text,email text);
    CREATE TABLE parent_students(parent_id uuid REFERENCES parent_profiles(id),student_id uuid REFERENCES students(id),PRIMARY KEY(parent_id,student_id));
    CREATE TABLE sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,status text,start_time timestamptz);
    ALTER TABLE students ENABLE ROW LEVEL SECURITY; ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT SELECT,UPDATE ON students TO service_role;
    GRANT SELECT,UPDATE ON parent_profiles TO service_role;
    GRANT SELECT ON organizations TO service_role;
    GRANT SELECT,INSERT ON parent_students TO service_role;
  `);
  await db.exec(readFileSync('supabase/migrations/20261013153130_student_registration_monitoring.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261021144505_managed_parent_link_integrity.sql','utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE student_registration_reminders,sessions,parent_students,parent_profiles,students,organizations,auth.users CASCADE;
    INSERT INTO organizations(id) VALUES ('${id(1)}'),('${id(2)}');
    INSERT INTO auth.users(id,email_confirmed_at,last_sign_in_at) VALUES ('${id(31)}',now(),now()),('${id(32)}',now(),null),('${id(33)}',now(),null);
    INSERT INTO parent_profiles VALUES ('${id(41)}','${id(31)}','Parent','family@example.test');
    INSERT INTO students(id,organization_id,full_name,email) VALUES
      ('${id(11)}','${id(1)}','Child',' FAMILY@example.test '),('${id(12)}','${id(1)}',' Child ','family@example.test');
  `);
});
async function link(ids = [id(11),id(12)], shared = true, role = 'service_role') {
  await db.exec(`SET ROLE ${role}`);
  try { await db.query('SELECT link_managed_parent_students($1,$2::uuid[],$3)',[id(41),ids,shared]); }
  finally { await db.exec('RESET ROLE'); }
}
async function family() {
  return (await db.query<{ id: string; linked_user_id: string | null; parent_user_id: string | null; links: number }>(`
    SELECT s.id,s.linked_user_id,s.parent_user_id,(SELECT count(*)::int FROM parent_students ps WHERE ps.student_id=s.id) AS links
    FROM students s ORDER BY s.id`)).rows;
}

describe('atomic managed parent links', () => {
  it('links both parent representations and the shared login for every tutor card, idempotently', async () => {
    await link(); await link();
    expect((await family()).map(({ linked_user_id,parent_user_id,links }) => ({ linked_user_id,parent_user_id,links })))
      .toEqual([{ linked_user_id:id(31),parent_user_id:id(31),links:1 },{ linked_user_id:id(31),parent_user_id:id(31),links:1 }]);
    const states = await db.query<{ registration_pending: boolean }>('SELECT registration_pending FROM org_student_registration_states($1,NULL)',[id(1)]);
    expect(states.rows.every((row) => row.registration_pending === false)).toBe(true);
  });

  it('repairs the Jonas case where the shared Auth identity exists but neither parent link does', async () => {
    await db.exec(`UPDATE students SET linked_user_id='${id(31)}'`);
    await link();
    expect((await family()).every((row) => row.parent_user_id===id(31) && row.links===1 && row.linked_user_id===id(31))).toBe(true);
  });

  it('preserves a distinct existing student login', async () => {
    await db.exec(`UPDATE students SET linked_user_id='${id(32)}'`);
    await link();
    expect((await family()).every((row) => row.linked_user_id===id(32) && row.parent_user_id===id(31))).toBe(true);
  });

  it.each(['name','organization','archived','conflicting-parent','conflicting-child'])('rejects changed %s evidence without partial links', async (scenario) => {
    const patch = {
      name: "full_name='Another child'", organization: `organization_id='${id(2)}'`, archived:'detached_at=now()',
      'conflicting-parent':`parent_user_id='${id(33)}'`, 'conflicting-child':`linked_user_id='${id(33)}'`,
    }[scenario]!;
    if (scenario==='conflicting-child') await db.exec(`UPDATE students SET linked_user_id='${id(32)}' WHERE id='${id(11)}'`);
    await db.exec(`UPDATE students SET ${patch} WHERE id='${id(12)}'`);
    await expect(link()).rejects.toThrow(/selection changed|conflicts/);
    expect((await family()).every((row) => row.links===0)).toBe(true);
    expect((await family())[0].parent_user_id).toBeNull();
  });

  it.each([{ ids:[id(11),id(99)] }, { ids:[] }, { ids:[id(11),null] }])('rejects an incomplete selection $ids', async ({ ids }) => {
    await expect(link(ids as string[])).rejects.toThrow();
    expect((await family()).every((row) => row.links===0)).toBe(true);
  });

  it('rolls back the link table and first pointer when the second student update fails', async () => {
    await db.exec(`CREATE FUNCTION reject_second_student() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.id='${id(12)}' THEN RAISE EXCEPTION 'second write failed'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_second_student BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION reject_second_student()`);
    try {
      await expect(link()).rejects.toThrow('second write failed');
      expect((await family()).every((row) => row.links===0 && row.parent_user_id===null && row.linked_user_id===null)).toBe(true);
    } finally { await db.exec('DROP TRIGGER reject_second_student ON students; DROP FUNCTION reject_second_student()'); }
  });

  it('requires the separate child identity option for verified school families', async () => {
    await db.exec(`UPDATE organizations SET features='{"school_family_portal":true}' WHERE id='${id(1)}'`);
    await expect(link()).rejects.toThrow(/separate child/);
    await link([id(11),id(12)],false);
    expect((await family()).every((row) => row.linked_user_id===null && row.parent_user_id===id(31) && row.links===1)).toBe(true);
  });

  it.each(['anon','authenticated'])('does not expose family linking to the %s browser role', async (role) => {
    await expect(link([id(11)],true,role)).rejects.toThrow(/permission denied/);
    expect((await family()).every((row) => row.links===0)).toBe(true);
  });
});
