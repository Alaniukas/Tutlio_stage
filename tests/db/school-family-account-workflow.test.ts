import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { bootstrapSchoolFamilyDatabase } from '../fixtures/schoolFamilyDatabase';
import { schoolFamilyPersonalCodeHash } from '../../api/_lib/schoolFamilyGuardianAccess';

const org = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const parent = '00000000-0000-4000-8000-000000000003';
const secondary = '00000000-0000-4000-8000-000000000004';
const childUser = '00000000-0000-4000-8000-000000000005';
const admin = '00000000-0000-4000-8000-000000000006';
const student = '00000000-0000-4000-8000-000000000010';
const sibling = '00000000-0000-4000-8000-000000000011';
const outsider = '00000000-0000-4000-8000-000000000012';
const contract = '00000000-0000-4000-8000-000000000020';
const siblingContract = '00000000-0000-4000-8000-000000000021';
const outsideContract = '00000000-0000-4000-8000-000000000022';

it('enforces annual guardian scope against legacy parent links, contact coincidence and cross-school grants', async () => {
  const db = new PGlite();
  try {
    await bootstrapSchoolFamilyDatabase(db);
    await db.exec(`
      INSERT INTO auth.users VALUES('${parent}'),('${secondary}'),('${childUser}'),('${admin}');
      INSERT INTO organizations(id,entity_type,features) VALUES('${org}','school','{"school_family_portal":true}'),('${other}','school','{"school_family_portal":true}');
      INSERT INTO students(id,organization_id,linked_user_id,parent_user_id,full_name,email) VALUES
        ('${student}','${org}','${childUser}','${parent}','Child','child@example.test'),
        ('${sibling}','${org}',null,'${parent}','Sibling',null),
        ('${outsider}','${other}',null,'${parent}','Other school','child@example.test');
      INSERT INTO school_contracts(id,organization_id,student_id) VALUES('${contract}','${org}','${student}'),('${siblingContract}','${org}','${sibling}'),('${outsideContract}','${other}','${outsider}');
      INSERT INTO parent_profiles(id,user_id,email) VALUES('${parent}','${parent}','parent@example.test'),('${secondary}','${secondary}','parent@example.test');
      INSERT INTO parent_students VALUES('${parent}','${student}'),('${secondary}','${student}'),('${parent}','${outsider}');
      INSERT INTO organization_admins(user_id,organization_id) VALUES('${admin}','${org}');
      INSERT INTO sessions(student_id) VALUES('${student}'),('${sibling}'),('${outsider}');
      INSERT INTO school_family_guardians(organization_id,student_id,annual_contract_id,guardian_user_id,guardian_name,guardian_email,identity_hash,evidence_source,verified_by) VALUES
        ('${org}','${student}','${contract}','${parent}','Parent','parent@example.test',repeat('a',64),'admin_verified','${admin}'),
        ('${org}','${sibling}','${siblingContract}','${parent}','Parent','parent@example.test',repeat('a',64),'admin_verified','${admin}');
      SELECT set_config('test.uid','${parent}',false);
    `);
    expect((await db.query<{ allowed: boolean }>(`SELECT parent_can_access_student('${student}') allowed`)).rows[0].allowed).toBe(true);
    expect((await db.query<{ allowed: boolean }>(`SELECT parent_can_access_student('${outsider}') allowed`)).rows[0].allowed).toBe(false);
    expect((await db.query(`SELECT * FROM get_parent_child_ids('${parent}')`)).rows).toHaveLength(2);
    expect((await db.query(`SELECT * FROM get_parent_child_ids('${secondary}')`)).rows).toHaveLength(0);
    await db.exec(`SET ROLE authenticated`);
    expect((await db.query(`SELECT id FROM students ORDER BY id`)).rows).toHaveLength(2);
    expect((await db.query(`SELECT id FROM sessions`)).rows).toHaveLength(2);
    await db.exec(`SELECT set_config('test.uid','${secondary}',false)`);
    expect((await db.query(`SELECT id FROM students`)).rows).toHaveLength(0);
    expect((await db.query(`SELECT * FROM parent_students`)).rows).toHaveLength(0);
    expect((await db.query(`SELECT id FROM sessions`)).rows).toHaveLength(0);
    await db.exec(`SELECT set_config('test.uid','${childUser}',false)`);
    expect((await db.query(`SELECT id FROM students`)).rows).toEqual([{ id: student }]);
    await db.exec(`SELECT set_config('test.uid','${admin}',false)`);
    expect((await db.query(`SELECT id FROM students`)).rows).toHaveLength(2);
    await db.exec(`RESET ROLE; SELECT set_config('test.uid','${parent}',false); UPDATE school_contracts SET terminated_at=now() WHERE id='${contract}'`);
    expect((await db.query<{ allowed: boolean }>(`SELECT parent_can_access_student('${student}') allowed`)).rows[0].allowed).toBe(false);
    expect((await db.query(`SELECT * FROM get_parent_child_ids('${parent}')`)).rows).toEqual([{ student_id: sibling }]);
    await db.exec(`UPDATE school_contracts SET terminated_at=null WHERE id='${contract}'; UPDATE students SET linked_user_id='${parent}' WHERE id='${student}'`);
    expect((await db.query<{ allowed: boolean }>(`SELECT school_family_is_guardian('${org}','${sibling}') allowed`)).rows[0].allowed).toBe(false);
    expect((await db.query(`SELECT * FROM get_parent_child_ids('${parent}')`)).rows).toHaveLength(0);
    await db.exec(`UPDATE organizations SET features='{}' WHERE id='${org}'; SELECT set_config('test.uid','${secondary}',false)`);
    expect((await db.query<{ allowed: boolean }>(`SELECT parent_can_access_student('${student}') allowed`)).rows[0].allowed).toBe(true);
    await expect(db.exec(`INSERT INTO school_family_guardians(organization_id,student_id,annual_contract_id,guardian_name,guardian_email,identity_hash,evidence_source,verified_by)
      VALUES('${org}','${student}','${outsideContract}','Parent','parent@example.test',repeat('b',64),'admin_verified','${admin}')`)).rejects.toThrow('school_family_invalid_annual_contract');
  } finally { await db.close(); }
}, 30000);

it('preserves legacy access during preparation and rechecks primary signature identity after cutover', async () => {
  const db = new PGlite();
  const signature = '00000000-0000-4000-8000-000000000030';
  const codeHash = schoolFamilyPersonalCodeHash('guardian-identity');
  try {
    await bootstrapSchoolFamilyDatabase(db);
    await db.exec(`INSERT INTO auth.users VALUES('${parent}'),('${secondary}'),('${childUser}'),('${admin}');
      INSERT INTO organizations(id,entity_type,features) VALUES('${org}','school','{"school_family_accounts_setup":true}');
      INSERT INTO students(id,organization_id,linked_user_id,parent_user_id,full_name,email)
        VALUES('${student}','${org}','${childUser}','${parent}','Child','child@example.test');
      INSERT INTO school_contracts(id,organization_id,student_id) VALUES('${contract}','${org}','${student}');
      INSERT INTO parent_profiles(id,user_id,email) VALUES('${secondary}','${secondary}','parent@example.test');
      INSERT INTO parent_students VALUES('${secondary}','${student}');
      INSERT INTO school_contract_signatures(id,contract_id,role,status,signer_name,signer_email,signer_personal_code)
        VALUES('${signature}','${contract}','parent_primary','signed','Parent One','parent@example.test','guardian-identity');
      INSERT INTO school_family_guardians(organization_id,student_id,annual_contract_id,guardian_user_id,guardian_name,
        guardian_email,identity_hash,evidence_source,signature_id,signature_personal_code_hash)
        VALUES('${org}','${student}','${contract}','${parent}','Parent One','parent@example.test',repeat('a',64),'signed_primary','${signature}','${codeHash}');
      SELECT set_config('test.uid','${secondary}',false);`);
    expect((await db.query<{ allowed: boolean }>(`SELECT parent_can_access_student('${student}') allowed`)).rows[0].allowed).toBe(true);
    await db.exec(`UPDATE organizations SET features='{"school_family_portal":true,"school_family_accounts_setup":true}';`);
    expect((await db.query<{ allowed: boolean }>(`SELECT parent_can_access_student('${student}') allowed`)).rows[0].allowed).toBe(false);
    await db.exec(`SELECT set_config('test.uid','${parent}',false);`);
    expect((await db.query<{ allowed: boolean }>(`SELECT school_family_is_guardian('${org}','${student}') allowed`)).rows[0].allowed).toBe(true);
    await db.exec(`UPDATE school_contract_signatures SET signer_personal_code='different-person' WHERE id='${signature}';`);
    expect((await db.query<{ allowed: boolean }>(`SELECT school_family_is_guardian('${org}','${student}') allowed`)).rows[0].allowed).toBe(false);
    await db.exec(`UPDATE school_contract_signatures SET signer_personal_code='guardian-identity',signer_name='Other Parent' WHERE id='${signature}';`);
    expect((await db.query<{ allowed: boolean }>(`SELECT school_family_is_guardian('${org}','${student}') allowed`)).rows[0].allowed).toBe(false);
  } finally { await db.close(); }
}, 30000);

it('keeps account tokens/evidence server-only, leases exclusive and disables contact self-claim only for opted-in schools', async () => {
  const db = new PGlite();
  try {
    await bootstrapSchoolFamilyDatabase(db);
    await db.exec(`INSERT INTO organizations(id,entity_type,features) VALUES('${org}','school','{"school_family_portal":true}');
      INSERT INTO students(id,organization_id,full_name,email) VALUES('${student}','${org}','Child','child@example.test');
      SELECT set_config('test.uid','${childUser}',false); SELECT set_config('test.email','child@example.test',false);`);
    expect((await db.query(`SELECT * FROM get_student_by_email_for_linking('child@example.test')`)).rows).toHaveLength(0);
    await db.exec(`UPDATE organizations SET features='{}' WHERE id='${org}'`);
    expect((await db.query(`SELECT * FROM get_student_by_email_for_linking('child@example.test')`)).rows).toHaveLength(1);
    const privileges = (await db.query<{ allowed: boolean }>(`SELECT has_table_privilege('authenticated','school_family_invitations','SELECT') AS allowed`)).rows[0];
    expect(privileges.allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>(`SELECT has_table_privilege('anon','school_family_guardians','SELECT') AS allowed`)).rows[0].allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('authenticated','school_family_claim_workflow(uuid,uuid,uuid)','EXECUTE') AS allowed`)).rows[0].allowed).toBe(false);
    expect((await db.query<{ claimed: boolean }>(`SELECT school_family_claim_workflow('${org}','${student}','${parent}') claimed`)).rows[0].claimed).toBe(true);
    expect((await db.query<{ claimed: boolean }>(`SELECT school_family_claim_workflow('${org}','${student}','${secondary}') claimed`)).rows[0].claimed).toBe(false);
    await db.exec(`UPDATE school_family_workflow_locks SET expires_at=now()-interval '1 second'`);
    expect((await db.query<{ claimed: boolean }>(`SELECT school_family_claim_workflow('${org}','${student}','${secondary}') claimed`)).rows[0].claimed).toBe(true);
    await db.exec(`DELETE FROM school_family_workflow_locks WHERE owner_id='${parent}'`);
    expect((await db.query(`SELECT * FROM school_family_workflow_locks`)).rows).toHaveLength(1);
  } finally { await db.close(); }
}, 30000);
