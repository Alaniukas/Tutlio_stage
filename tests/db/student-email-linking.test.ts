import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('refuses ambiguous, archived, placeholder and parent-owned contact matches in SQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth;
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"email":"child@example.test"}'::jsonb $$;
      CREATE TABLE students(id uuid,linked_user_id uuid,full_name text,email text,detached_at timestamptz);
      CREATE TABLE parent_profiles(user_id uuid); CREATE TABLE organization_admins(user_id uuid);`);
    await db.exec(readFileSync('supabase/migrations/20260910172000_unambiguous_student_email_link.sql', 'utf8'));
    const lookup = async () => (await db.query("select * from get_student_by_email_for_linking('child@example.test')")).rows;
    await db.exec("insert into students values ('00000000-0000-4000-8000-000000000002',null,'Kotryna','child@example.test',null)");
    expect(await lookup()).toHaveLength(1);
    await db.exec("insert into students values ('00000000-0000-4000-8000-000000000003',null,'Laukiama registracijos','child@example.test',null)");
    expect(await lookup()).toHaveLength(0);
    await db.exec("delete from students where full_name='Laukiama registracijos'; update students set detached_at=now()");
    expect(await lookup()).toHaveLength(0);
    await db.exec("update students set detached_at=null, full_name='Laukiama registracijos'");
    expect(await lookup()).toHaveLength(0);
    await db.exec("update students set full_name='Kotryna'; insert into parent_profiles values (auth.uid())");
    expect(await lookup()).toHaveLength(0);
    expect((await db.query("select * from get_student_by_email_for_linking('other@example.test')")).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30000);
