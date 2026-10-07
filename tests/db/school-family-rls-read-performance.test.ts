// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapSchoolFamilyDatabase } from '../fixtures/schoolFamilyDatabase';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const school = id(1);
const outsideSchool = id(2);
const admin = id(11);
const teacher = id(12);
const unrelatedTeacher = id(13);
const outsideAdmin = id(14);
const parent = id(21);
const legacyParent = id(22);
const child = id(23);
const migration = readFileSync('supabase/migrations/20261007070442_school_family_rls_read_performance.sql', 'utf8');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSchoolFamilyDatabase(db);
  await db.exec(`
    CREATE TABLE school_class_groups(id uuid PRIMARY KEY,organization_id uuid,tutor_id uuid);
    CREATE TABLE school_class_group_members(group_id uuid,student_id uuid);
    CREATE TABLE school_payment_installments(id uuid PRIMARY KEY,contract_id uuid,amount numeric);
    CREATE INDEX ON school_contract_signatures(contract_id);
    CREATE INDEX ON school_payment_installments(contract_id);
    CREATE FUNCTION public.is_school_admin(p_org_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off AS $$
      SELECT EXISTS(SELECT 1 FROM public.organization_admins a WHERE a.organization_id=p_org_id AND a.user_id=auth.uid());
    $$;
    INSERT INTO auth.users VALUES('${admin}'),('${teacher}'),('${unrelatedTeacher}'),('${outsideAdmin}'),
      ('${parent}'),('${legacyParent}'),('${child}');
    INSERT INTO organizations(id,entity_type,features) VALUES
      ('${school}','school','{"school_family_portal":true}'),
      ('${outsideSchool}','school','{"school_family_portal":true}');
    INSERT INTO organization_admins(user_id,organization_id) VALUES('${admin}','${school}'),('${outsideAdmin}','${outsideSchool}');
    INSERT INTO students(id,organization_id,full_name)
      SELECT ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'${school}','Child '||n
      FROM generate_series(1,180) n;
    INSERT INTO students(id,organization_id,full_name) VALUES('${id(1190)}','${outsideSchool}','Other school child');
    UPDATE students SET tutor_id='${teacher}',parent_user_id='${parent}' WHERE id='${id(1001)}';
    UPDATE students SET linked_user_id='${child}',parent_user_id='${parent}' WHERE id='${id(1003)}';
    INSERT INTO school_class_groups VALUES('${id(51)}','${school}','${teacher}');
    INSERT INTO school_class_group_members SELECT '${id(51)}',id FROM students WHERE organization_id='${school}';
    INSERT INTO sessions(student_id,tutor_id) SELECT id,'${teacher}' FROM students WHERE organization_id='${school}';
    INSERT INTO school_contracts(id,organization_id,student_id)
      SELECT ('00000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,'${school}',
        ('00000000-0000-4000-8000-'||lpad((1001+(n-1)/2)::text,12,'0'))::uuid
      FROM generate_series(1,360) n;
    INSERT INTO school_contracts(id,organization_id) VALUES('${id(2401)}','${school}'),('${id(2402)}','${school}'),('${id(2403)}','${school}');
    INSERT INTO school_contracts(id,organization_id,student_id) VALUES('${id(2490)}','${outsideSchool}','${id(1190)}');
    INSERT INTO school_contract_signatures(id,contract_id,role,status,signer_name,signer_email,signer_personal_code)
      SELECT ('00000000-0000-4000-8000-'||lpad((3000+n)::text,12,'0'))::uuid,
        ('00000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,'school','signed','Parent','parent@example.test','identity'
      FROM generate_series(1,360) n;
    UPDATE school_contract_signatures SET role='parent_primary' WHERE id='${id(3001)}';
    INSERT INTO school_payment_installments
      SELECT ('00000000-0000-4000-8000-'||lpad((4000+n)::text,12,'0'))::uuid,
        ('00000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,100
      FROM generate_series(1,360) n;
    INSERT INTO parent_profiles(id,user_id,email) VALUES('${parent}','${parent}','parent@example.test'),('${legacyParent}','${legacyParent}','parent@example.test');
    INSERT INTO parent_students VALUES('${parent}','${id(1001)}'),('${legacyParent}','${id(1002)}');
    INSERT INTO school_family_guardians(organization_id,student_id,annual_contract_id,guardian_user_id,guardian_name,
      guardian_email,identity_hash,evidence_source,signature_id,signature_personal_code_hash)
      VALUES('${school}','${id(1001)}','${id(2001)}','${parent}','Parent','parent@example.test',repeat('a',64),
        'signed_primary','${id(3001)}',encode(sha256(convert_to('identity','UTF8')),'hex'));
    INSERT INTO school_family_guardians(organization_id,student_id,annual_contract_id,guardian_user_id,guardian_name,
      guardian_email,identity_hash,evidence_source,verified_by)
      VALUES('${school}','${id(1003)}','${id(2005)}','${parent}','Parent','parent@example.test',repeat('a',64),'admin_verified','${admin}');

    DROP POLICY legacy_students ON students;
    CREATE POLICY student_roles ON students FOR SELECT TO authenticated USING(
      tutor_id=auth.uid() OR linked_user_id=auth.uid() OR org_admin_can_access_student(id) OR parent_can_access_student(id));
    DROP POLICY legacy_contracts ON school_contracts;
    CREATE POLICY school_contracts_admin_select ON school_contracts FOR SELECT USING(is_school_admin(organization_id));
    CREATE POLICY school_contracts_parent_select ON school_contracts FOR SELECT USING(parent_can_access_student(student_id));
    CREATE POLICY school_contracts_student_select ON school_contracts FOR SELECT
      USING(student_id IN (SELECT id FROM students WHERE linked_user_id=auth.uid()));
    DROP POLICY legacy_sessions ON sessions;
    CREATE POLICY session_roles ON sessions FOR SELECT TO authenticated USING(
      tutor_id=auth.uid() OR org_admin_can_access_student(student_id) OR parent_can_access_student(student_id)
      OR student_id IN (SELECT id FROM students WHERE linked_user_id=auth.uid()));
    ALTER TABLE school_contract_signatures ENABLE ROW LEVEL SECURITY;
    ALTER TABLE school_payment_installments ENABLE ROW LEVEL SECURITY;
    -- Match the production policy chains that expand every contract embed.
    CREATE POLICY school_signatures_admin_select ON school_contract_signatures FOR SELECT
      USING(contract_id IN (SELECT id FROM school_contracts WHERE is_school_admin(organization_id)));
    CREATE POLICY school_installments_admin_select ON school_payment_installments FOR SELECT
      USING(contract_id IN (SELECT id FROM school_contracts WHERE is_school_admin(organization_id)));
    CREATE POLICY school_installments_parent_select ON school_payment_installments FOR SELECT
      USING(contract_id IN (SELECT id FROM school_contracts WHERE parent_can_access_student(student_id)));
    CREATE POLICY school_installments_student_select ON school_payment_installments FOR SELECT
      USING(contract_id IN (SELECT c.id FROM school_contracts c JOIN students s ON s.id=c.student_id WHERE s.linked_user_id=auth.uid()));
    GRANT SELECT ON school_contract_signatures,school_payment_installments TO authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/20260903161001_fix_students_school_tutor_select_recursion.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261006095115_school_family_tutor_schedule_scope.sql', 'utf8'));
}, 30_000);

beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('RESET ROLE; ROLLBACK'); });
afterAll(async () => { await db?.close(); });

async function asUser(user: string) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid',$1,false)", [user]);
  await db.exec('SET ROLE authenticated');
}

async function applyFix() {
  await db.exec('RESET ROLE');
  await db.exec(migration);
}

const embeddedContracts = `
  SELECT c.id,c.student_id,
    (SELECT count(*)::int FROM students s WHERE s.id=c.student_id) student_count,
    (SELECT count(*)::int FROM school_contract_signatures sig WHERE sig.contract_id=c.id) signature_count,
    (SELECT count(*)::int FROM school_payment_installments i WHERE i.contract_id=c.id) installment_count
  FROM school_contracts c ORDER BY c.id`;

describe('school family RLS read performance', () => {
  it('preserves all 363 admin contracts and their nested student/signature/installment results', async () => {
    await asUser(admin);
    const before = (await db.query(embeddedContracts)).rows;
    await applyFix();
    await asUser(admin);
    const after = (await db.query(embeddedContracts)).rows;
    expect(after).toEqual(before);
    expect(after).toHaveLength(363);
    expect(after.slice(0,360).every(row => row.student_count===1 && row.signature_count===1 && row.installment_count===1)).toBe(true);
    expect((await db.query('SELECT id FROM students')).rows).toHaveLength(180);
    expect((await db.query('SELECT id FROM sessions')).rows).toHaveLength(180);
    await asUser(outsideAdmin);
    expect((await db.query(embeddedContracts)).rows.map(row => row.id)).toEqual([id(2490)]);
  }, 30_000);

  it('reproduces the old admin path evaluating an unnecessary guardian check', async () => {
    await db.exec(`CREATE OR REPLACE FUNCTION public.parent_can_access_student(p_student_id uuid) RETURNS boolean
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
      BEGIN RAISE EXCEPTION 'unexpected guardian lookup'; END; $$;`);
    await asUser(admin);
    await db.exec('SAVEPOINT reproduce');
    await expect(db.query('SELECT school_family_student_scope_allowed($1)',[id(1001)])).rejects.toThrow('unexpected guardian lookup');
    await db.exec('ROLLBACK TO SAVEPOINT reproduce');
  });

  it('short-circuits staff and student scope before any guardian lookup after the fix', async () => {
    await applyFix();
    await db.exec(`CREATE OR REPLACE FUNCTION public.parent_can_access_student(p_student_id uuid) RETURNS boolean
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
      BEGIN RAISE EXCEPTION 'unexpected guardian lookup'; END; $$;`);
    for (const [user,student] of [[admin,id(1001)],[teacher,id(1001)],[teacher,id(1002)],[child,id(1003)]]) {
      await asUser(user);
      expect((await db.query<{ allowed: boolean }>('SELECT school_family_student_scope_allowed($1) allowed',[student])).rows[0].allowed).toBe(true);
    }
  });

  it('keeps teacher, verified guardian and child scopes separate from unrelated and legacy identities', async () => {
    await applyFix();
    await asUser(teacher);
    expect((await db.query('SELECT id FROM students')).rows).toHaveLength(180);
    expect((await db.query('SELECT id FROM sessions')).rows).toHaveLength(180);
    expect((await db.query(embeddedContracts)).rows).toEqual([]);
    for (const user of [unrelatedTeacher,legacyParent]) {
      await asUser(user);
      expect((await db.query('SELECT id FROM students')).rows).toEqual([]);
      expect((await db.query('SELECT id FROM sessions')).rows).toEqual([]);
      expect((await db.query(embeddedContracts)).rows).toEqual([]);
    }
    await asUser(parent);
    expect((await db.query('SELECT id FROM students ORDER BY id')).rows.map(row => row.id)).toEqual([id(1001),id(1003)]);
    const contracts = (await db.query(embeddedContracts)).rows;
    expect(contracts).toHaveLength(4);
    expect(contracts.every(row => row.installment_count===1 && row.signature_count===0)).toBe(true);
    await asUser(child);
    expect((await db.query(embeddedContracts)).rows.map(row => row.id)).toEqual([id(2005),id(2006)]);
  });

  it('rechecks guardian evidence, contract termination and shared child identities', async () => {
    await applyFix();
    await asUser(parent);
    expect((await db.query<{ allowed: boolean }>('SELECT parent_can_access_student($1) allowed',[id(1001)])).rows[0].allowed).toBe(true);
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE school_contract_signatures SET signer_personal_code='changed' WHERE id='${id(3001)}';`);
    await asUser(parent);
    expect((await db.query<{ allowed: boolean }>('SELECT parent_can_access_student($1) allowed',[id(1001)])).rows[0].allowed).toBe(false);
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE school_contracts SET terminated_at=now() WHERE id='${id(2005)}';`);
    await asUser(parent);
    expect((await db.query(embeddedContracts)).rows).toEqual([]);
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE school_contracts SET terminated_at=null WHERE id='${id(2005)}';
      UPDATE students SET linked_user_id='${parent}' WHERE id='${id(1002)}';`);
    await asUser(parent);
    expect((await db.query<{ allowed: boolean }>('SELECT school_family_is_guardian($1,$2) allowed',[school,id(1003)])).rows[0].allowed).toBe(false);
  });

  it('preserves legacy access with the flag off and keeps both helpers unavailable to anonymous callers', async () => {
    await applyFix();
    await db.exec(`UPDATE organizations SET features='{}' WHERE id='${school}';`);
    await asUser(legacyParent);
    expect((await db.query('SELECT id FROM students')).rows).toEqual([{id:id(1002)}]);
    for (const signature of ['school_family_is_guardian(uuid,uuid)','school_family_student_scope_allowed(uuid)']) {
      expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('anon',$1,'EXECUTE') allowed",['public.'+signature])).rows[0].allowed).toBe(false);
    }
    await applyFix();
    await asUser(admin);
    expect((await db.query(embeddedContracts)).rows).toHaveLength(363);
  });
});
