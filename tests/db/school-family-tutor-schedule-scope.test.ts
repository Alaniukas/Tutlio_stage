// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapSchoolFamilyDatabase } from '../fixtures/schoolFamilyDatabase';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readFileSync('supabase/migrations/20261006095115_school_family_tutor_schedule_scope.sql', 'utf8');
const school = id(1);
const otherSchool = id(2);
const teacher = id(11);
const colleague = id(12);
const otherTeacher = id(13);
const parent = id(21);
const legacyParent = id(22);
const childUser = id(23);
const admin = id(24);
const children = [31, 32, 33, 34].map(id);
const individual = id(35);
const rosterOnly = id(36);
const directChild = id(38);
const colleagueChild = id(39);
const outsideChild = id(40);
const group = id(51);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSchoolFamilyDatabase(db);
  await db.exec(`
    CREATE TABLE school_class_groups(id uuid PRIMARY KEY, organization_id uuid, tutor_id uuid);
    CREATE TABLE school_class_group_members(group_id uuid, student_id uuid, PRIMARY KEY(group_id,student_id));
    ALTER TABLE sessions ADD COLUMN start_time timestamptz, ADD COLUMN end_time timestamptz,
      ADD COLUMN status text DEFAULT 'active', ADD COLUMN class_group_id uuid;
    ALTER TABLE school_class_groups ENABLE ROW LEVEL SECURITY;
    ALTER TABLE school_class_group_members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_groups ON school_class_groups FOR SELECT TO authenticated USING(tutor_id=auth.uid());
    CREATE POLICY own_members ON school_class_group_members FOR SELECT TO authenticated
      USING(group_id IN (SELECT id FROM school_class_groups));
    GRANT SELECT ON school_class_groups,school_class_group_members TO authenticated;
    DROP POLICY legacy_students ON students;
    CREATE POLICY student_roles ON students FOR SELECT TO authenticated USING(
      tutor_id=auth.uid() OR linked_user_id=auth.uid()
      OR parent_can_access_student(id) OR org_admin_can_access_student(id));
    DROP POLICY legacy_sessions ON sessions;
    CREATE POLICY session_roles ON sessions FOR SELECT TO authenticated USING(
      tutor_id=auth.uid() OR parent_can_access_student(student_id)
      OR org_admin_can_access_student(student_id)
      OR student_id IN (SELECT id FROM students WHERE linked_user_id=auth.uid()));
    INSERT INTO auth.users VALUES('${teacher}'),('${colleague}'),('${otherTeacher}'),
      ('${parent}'),('${legacyParent}'),('${childUser}'),('${admin}');
    INSERT INTO organizations(id,entity_type,features) VALUES
      ('${school}','school','{}'), ('${otherSchool}','school','{"school_family_portal":true}');
    INSERT INTO organization_admins(user_id,organization_id) VALUES('${admin}','${school}');
    INSERT INTO students(id,organization_id,full_name)
      SELECT value::uuid,'${school}','Group child' FROM unnest(ARRAY[${children.map(value => `'${value}'`).join(',')}]) value;
    INSERT INTO students(id,organization_id,full_name,tutor_id) VALUES
      ('${individual}','${school}','Individual child',null),
      ('${rosterOnly}','${school}','Unsigned roster child',null),
      ('${directChild}','${school}','Direct child','${teacher}'),
      ('${colleagueChild}','${school}','Colleague child',null),
      ('${outsideChild}','${otherSchool}','Other school child',null);
    UPDATE students SET linked_user_id='${childUser}',parent_user_id='${parent}' WHERE id='${children[0]}';
    UPDATE students SET parent_user_id='${parent}' WHERE id='${outsideChild}';
    INSERT INTO school_class_groups VALUES('${group}','${school}','${teacher}'),
      ('${id(52)}','${school}','${colleague}'), ('${id(53)}','${otherSchool}','${otherTeacher}');
    INSERT INTO school_class_group_members
      SELECT '${group}',id FROM students WHERE id IN (${[...children, rosterOnly].map(value => `'${value}'`).join(',')});
    INSERT INTO school_class_group_members VALUES('${id(52)}','${colleagueChild}'),('${id(53)}','${outsideChild}');
    INSERT INTO sessions(id,student_id,tutor_id,start_time,end_time,status,class_group_id)
      SELECT ('00000000-0000-4000-8000-' || lpad((100+ordinal)::text,12,'0'))::uuid,
        value::uuid,'${teacher}','2026-10-06T08:00Z','2026-10-06T08:45Z','completed','${group}'
      FROM unnest(ARRAY[${children.map(value => `'${value}'`).join(',')}]) WITH ORDINALITY child(value,ordinal);
    INSERT INTO sessions(id,student_id,tutor_id,start_time,end_time,class_group_id)
      SELECT ('00000000-0000-4000-8000-' || lpad((104+ordinal)::text,12,'0'))::uuid,
        value::uuid,'${teacher}','2026-10-13T08:00Z','2026-10-13T08:45Z','${group}'
      FROM unnest(ARRAY[${children.map(value => `'${value}'`).join(',')}]) WITH ORDINALITY child(value,ordinal);
    INSERT INTO sessions(id,student_id,tutor_id,start_time,end_time,status) VALUES
      ('${id(109)}','${individual}','${teacher}','2026-10-06T09:00Z','2026-10-06T09:45Z','completed'),
      ('${id(110)}','${directChild}','${teacher}','2026-10-06T10:00Z','2026-10-06T10:45Z','active'),
      ('${id(111)}','${colleagueChild}','${colleague}','2026-10-06T08:00Z','2026-10-06T08:45Z','active'),
      ('${id(112)}','${outsideChild}','${otherTeacher}','2026-10-06T08:00Z','2026-10-06T08:45Z','active');
    INSERT INTO parent_profiles(id,user_id,email) VALUES
      ('${parent}','${parent}','parent@example.test'), ('${legacyParent}','${legacyParent}','parent@example.test');
    INSERT INTO parent_students VALUES('${parent}','${children[0]}'),('${legacyParent}','${children[0]}'),('${parent}','${outsideChild}');
    INSERT INTO school_contracts(id,organization_id,student_id)
      SELECT ('00000000-0000-4000-8000-' || lpad((200+row_number() OVER ())::text,12,'0'))::uuid,
        organization_id,id FROM students;
    INSERT INTO school_family_guardians(organization_id,student_id,annual_contract_id,guardian_user_id,
      guardian_name,guardian_email,identity_hash,evidence_source,verified_by)
      SELECT '${school}','${children[0]}',id,'${parent}','Parent','parent@example.test',repeat('a',64),'admin_verified','${admin}'
      FROM school_contracts WHERE student_id='${children[0]}';
  `);
  await db.exec(readFileSync('supabase/migrations/20260903161001_fix_students_school_tutor_select_recursion.sql', 'utf8'));
}, 30_000);

beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('RESET ROLE; ROLLBACK'); });
afterAll(async () => { await db?.close(); });

async function asUser(user: string) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid',$1,false)", [user]);
  await db.exec('SET ROLE authenticated');
}

async function activateAndFix() {
  await db.exec(`UPDATE organizations SET features='{"school_family_portal":true}' WHERE id='${school}'`);
  await db.exec(migration);
}

async function visibleSessions() {
  return (await db.query<{ id: string }>('SELECT id::text FROM sessions ORDER BY id')).rows.map(row => row.id);
}

async function visibleStudents() {
  return (await db.query<{ id: string }>('SELECT id::text FROM students ORDER BY id')).rows.map(row => row.id);
}

describe('school family portal tutor schedule scope', () => {
  it('reproduces the portal cutover hiding completed/future group lessons and restores their student joins', async () => {
    await asUser(teacher);
    expect(await visibleSessions()).toEqual(Array.from({ length: 10 }, (_, index) => id(101 + index)));
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE organizations SET features='{"school_family_portal":true}' WHERE id='${school}'`);
    await asUser(teacher);
    expect(await visibleSessions()).toEqual([id(110)]);
    expect(await visibleStudents()).toEqual([directChild]);
    await db.exec('RESET ROLE');
    await db.exec(migration);
    await asUser(teacher);
    expect(await visibleSessions()).toEqual(Array.from({ length: 10 }, (_, index) => id(101 + index)));
    const completed = await db.query<{ student_id: string; full_name: string }>(`
      SELECT lesson.student_id::text,child.full_name FROM sessions lesson
      JOIN students child ON child.id=lesson.student_id
      WHERE lesson.class_group_id='${group}' AND lesson.status='completed' ORDER BY lesson.student_id`);
    expect(completed.rows.map(row => row.student_id)).toEqual(children);
    expect(completed.rows.every(row => row.full_name === 'Group child')).toBe(true);
  });

  it('keeps roster-only children and individual lessons without a direct tutor assignment visible', async () => {
    await activateAndFix();
    await asUser(teacher);
    expect(await visibleStudents()).toEqual([...children, individual, rosterOnly, directChild]);
    expect(await visibleSessions()).toContain(id(109));
    expect((await db.query<{ allowed: boolean }>(
      'SELECT school_family_student_scope_allowed($1) allowed', [rosterOnly],
    )).rows[0].allowed).toBe(true);
    expect(await visibleSessions()).toHaveLength(10);
  });

  it('preserves own lesson history after roster removal while enforcing the current roster for children without sessions', async () => {
    await activateAndFix();
    await db.exec(`DELETE FROM school_class_group_members WHERE group_id='${group}'`);
    await asUser(teacher);
    expect(await visibleSessions()).toHaveLength(10);
    expect(await visibleStudents()).toEqual([...children, individual, directChild]);
    expect((await db.query<{ allowed: boolean }>(
      'SELECT school_family_student_scope_allowed($1) allowed', [rosterOnly],
    )).rows[0].allowed).toBe(false);
  });

  it('denies unrelated teachers in the same school and teachers from another school', async () => {
    await activateAndFix();
    await asUser(colleague);
    expect(await visibleSessions()).toEqual([id(111)]);
    expect(await visibleStudents()).toEqual([colleagueChild]);
    await asUser(otherTeacher);
    expect(await visibleSessions()).toEqual([id(112)]);
    expect(await visibleStudents()).toEqual([outsideChild]);
    await asUser(teacher);
    expect((await db.query<{ allowed: boolean }>(
      'SELECT school_family_student_scope_allowed($1) allowed', [outsideChild],
    )).rows[0].allowed).toBe(false);
  });

  it('preserves verified guardian and child access without accepting contact coincidence or legacy parent links', async () => {
    await activateAndFix();
    await asUser(parent);
    expect(await visibleStudents()).toEqual([children[0]]);
    expect(await visibleSessions()).toEqual([id(101), id(105)]);
    expect((await db.query('SELECT student_id FROM school_contracts')).rows).toEqual([{ student_id: children[0] }]);
    await asUser(legacyParent);
    expect(await visibleStudents()).toEqual([]);
    expect(await visibleSessions()).toEqual([]);
    expect((await db.query('SELECT * FROM parent_students')).rows).toEqual([]);
    await asUser(childUser);
    expect(await visibleStudents()).toEqual([children[0]]);
    expect(await visibleSessions()).toEqual([id(101), id(105)]);
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE school_contracts SET terminated_at=now() WHERE student_id='${children[0]}'`);
    await asUser(parent);
    expect(await visibleSessions()).toEqual([]);
  });

  it('preserves organization administrator scope and denies anonymous helper access', async () => {
    await activateAndFix();
    await asUser(admin);
    expect(await visibleSessions()).toHaveLength(11);
    expect(await visibleStudents()).toEqual([...children, individual, rosterOnly, directChild, colleagueChild]);
    expect((await db.query<{ allowed: boolean }>(`
      SELECT has_function_privilege('anon','public.school_family_student_scope_allowed(uuid)','EXECUTE') allowed`,
    )).rows[0].allowed).toBe(false);
    await db.exec('RESET ROLE');
    await db.exec(migration);
    await asUser(teacher);
    expect(await visibleSessions()).toHaveLength(10);
  });
});
