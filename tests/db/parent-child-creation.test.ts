import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('adds a child and parent link atomically and rejects repeated creation', async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid);
      CREATE TABLE parent_profiles(id uuid PRIMARY KEY,user_id uuid,full_name text,email text);
      CREATE TABLE students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),full_name text,email text,organization_id uuid,
        tutor_id uuid,parent_user_id uuid,invite_code text UNIQUE,payment_payer text,payer_name text,payer_email text,enrollment_status text,detached_at timestamptz);
      CREATE TABLE parent_students(parent_id uuid REFERENCES parent_profiles,student_id uuid REFERENCES students,PRIMARY KEY(parent_id,student_id));`);
    await db.exec(readFileSync('supabase/migrations/20260909012000_atomic_parent_child_creation.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20260910173000_atomic_parent_child_creation.sql', 'utf8'));
    await db.query("insert into parent_profiles values ($1,$2,'Parent','parent@example.test');", [id(1), id(3)]);
    await db.query("insert into students(id,full_name,organization_id,tutor_id) values ($1,'First Child',$2,$3)", [id(2), id(10), id(20)]);
    await db.query('insert into parent_students values ($1,$2)', [id(1), id(2)]);
    const add = (name: string, code: string) => db.query('select * from add_parent_child_once($1,$2,$3,$4,$5)', [id(1), id(2), name, 'child@example.test', code]);
    const first = (await add('Vardytė Pavardytė', 'ABC123')).rows[0] as any;
    expect(first.created).toBe(true);
    expect((await add('  VARDYTĖ   PAVARDYTĖ ', 'DEF456')).rows).toEqual([{ student_id: first.student_id, created: false }]);
    expect((await db.query('select student_id from parent_students where student_id=$1', [first.student_id])).rows).toHaveLength(1);
    expect((await add('Other Sibling', 'GHI789')).rows[0]).toMatchObject({ created: true });
    await db.query(
      'insert into students(id,full_name,organization_id,tutor_id,parent_user_id) values ($1,$2,$3,$4,$5)',
      [id(4), 'Direct Child', id(10), id(20), id(3)],
    );
    expect((await db.query(
      'select * from add_parent_child_once($1,$2,$3,$4,$5)',
      [id(1), id(4), 'Direct Child Sibling', 'direct@example.test', 'DIR123'],
    )).rows[0]).toMatchObject({ created: true });
    // Simulate a failed relationship insert: the child must roll back as well.
    await db.exec(`CREATE FUNCTION fail_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'link unavailable'; END $$;
      CREATE TRIGGER fail_link BEFORE INSERT ON parent_students FOR EACH ROW EXECUTE FUNCTION fail_link();`);
    await expect(add('Retry Child', 'JKL012')).rejects.toThrow('link unavailable');
    expect((await db.query("select id from students where full_name='Retry Child'")).rows).toHaveLength(0);
    await db.exec('DROP TRIGGER fail_link ON parent_students');
    expect((await add('Retry Child', 'JKL012')).rows[0]).toMatchObject({ created: true });
    await db.query('update students set detached_at=now() where id=$1', [id(2)]);
    await expect(add('Archived Template', 'MNO345')).rejects.toThrow('Active child not found');
  } finally { await db.close(); }
}, 30000);
