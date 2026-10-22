// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const repair = readFileSync('scripts/sql/repair-mk-greta-parent-links-20261022.sql', 'utf8');
const live = 'ab86d501-2dc9-44fe-93d9-51f4d3e56fb5';
const archived = 'c40d3ff1-12c1-470a-b473-bd39a8bab430';
const org = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';
const child = '73d4b8b1-2ad8-4c8d-be65-c7ea7ff5c97c';
const parent = '7196537a-c7a0-49eb-ad77-0442ac631372';
const profile = '7e7c652c-d9fa-4280-8e37-f20b2d0052e3';
const tutor = 'e1941de1-8232-4582-8c81-c0cee0af2ae7';
const other = '00000000-0000-4000-8000-000000000099';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,tutor_id uuid,linked_user_id uuid,
      parent_user_id uuid,full_name text,email text,payer_email text,detached_at timestamptz,enrollment_status text);
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY,user_id uuid,email text);
    CREATE TABLE parent_students(parent_id uuid REFERENCES parent_profiles(id),student_id uuid REFERENCES students(id),
      PRIMARY KEY(parent_id,student_id));
    CREATE TABLE sessions(id integer PRIMARY KEY,student_id uuid REFERENCES students(id),price numeric);
  `);
}, 30_000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`
    DROP TRIGGER IF EXISTS reject_parent_insert ON parent_students;
    TRUNCATE sessions,parent_students,parent_profiles,students,auth.users CASCADE;
    INSERT INTO auth.users VALUES ('${parent}','parent@example.test',now());
    INSERT INTO parent_profiles VALUES ('${profile}','${parent}','parent@example.test'),('${other}','${other}','other@example.test');
    INSERT INTO students VALUES
      ('${live}','${org}','${tutor}','${child}',null,'Example Child','child@example.test','parent@example.test',null,'active'),
      ('${archived}','${org}',null,'${child}','${parent}','Example Child','child@example.test',null,'2026-10-22T12:04:02.561Z','active');
    INSERT INTO parent_students VALUES ('${profile}','${archived}');
    INSERT INTO sessions SELECT n,CASE WHEN n<=6 THEN '${live}'::uuid ELSE '${archived}'::uuid END,30
      FROM generate_series(1,13) n;
  `);
});

async function apply() {
  try { await db.exec(repair); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}

async function snapshot() {
  return Promise.all(['students','parent_students','sessions'].map(async (table) =>
    (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows,
  ));
}

describe('verified MK family-link incident repair', () => {
  it('adds both live-card parent links and preserves the archived card and all 13 lessons', async () => {
    const before = await snapshot();
    await apply();
    const after = await snapshot();
    expect((await db.query('SELECT parent_user_id FROM students WHERE id=$1',[live])).rows[0].parent_user_id).toBe(parent);
    expect((await db.query('SELECT * FROM parent_students WHERE student_id=$1',[live])).rows)
      .toEqual([{ parent_id: profile,student_id: live }]);
    expect(after[0].find((row: any) => row.row.id===archived)).toEqual(before[0].find((row: any) => row.row.id===archived));
    expect(after[2]).toEqual(before[2]);
  });

  it('is safe to repeat without adding duplicate links', async () => {
    await apply();
    const before = await snapshot();
    await apply();
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    `UPDATE students SET organization_id='${other}' WHERE id='${live}'`,
    `UPDATE students SET linked_user_id='${other}' WHERE id='${archived}'`,
    `UPDATE students SET parent_user_id='${other}' WHERE id='${live}'`,
    `UPDATE students SET detached_at=now() WHERE id='${live}'`,
    `UPDATE students SET full_name='Another Child' WHERE id='${archived}'`,
    `UPDATE students SET email='another@example.test' WHERE id='${live}'`,
    `UPDATE auth.users SET email='another@example.test' WHERE id='${parent}'`,
    `INSERT INTO parent_students VALUES ('${other}','${live}')`,
    `DELETE FROM parent_students WHERE student_id='${archived}'`,
  ])('rejects changed or conflicting family evidence (%s)', async (change) => {
    await db.exec(change);
    const before = await snapshot();
    await expect(apply()).rejects.toThrow('verified family state changed');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back the pointer if inserting the portal link fails', async () => {
    await db.exec(`CREATE OR REPLACE FUNCTION test_reject_parent_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'parent insert failed'; END $$;
      CREATE TRIGGER reject_parent_insert BEFORE INSERT ON parent_students FOR EACH ROW EXECUTE FUNCTION test_reject_parent_insert();`);
    const before = await snapshot();
    await expect(apply()).rejects.toThrow('parent insert failed');
    expect(await snapshot()).toEqual(before);
  });
});
