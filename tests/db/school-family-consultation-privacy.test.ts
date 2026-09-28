// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
async function privacyDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.viewer_id',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY, entity_type text, features jsonb);
    CREATE TABLE organization_admins(organization_id uuid, user_id uuid);
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid, help_team_category text);
    CREATE TABLE students(id uuid PRIMARY KEY, organization_id uuid, linked_user_id uuid, parent_user_id uuid, full_name text, email text, detached_at timestamptz);
    CREATE TABLE school_contracts(id uuid PRIMARY KEY, organization_id uuid, student_id uuid, kind text, signing_status text, archived_at timestamptz, terminated_at timestamptz);
    CREATE TABLE school_contract_signatures(id uuid PRIMARY KEY, contract_id uuid, role text, status text, signer_email text, signer_name text, signer_personal_code text);
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE parent_students(parent_id uuid, student_id uuid);
    CREATE TABLE sessions(id uuid PRIMARY KEY, student_id uuid);
    CREATE TABLE school_consultation_requests(id uuid PRIMARY KEY, organization_id uuid, student_id uuid);
    CREATE TABLE school_consultations(id uuid PRIMARY KEY, organization_id uuid, student_id uuid, tutor_id uuid, kind text, help_team_category text);
    CREATE FUNCTION public.tutor_can_access_student(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.org_admin_can_access_student(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM public.students s JOIN public.organization_admins a ON a.organization_id=s.organization_id WHERE s.id=$1 AND a.user_id=auth.uid()) $$;
    CREATE FUNCTION public.is_school_admin(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM public.organization_admins WHERE organization_id=$1 AND user_id=auth.uid()) $$;
    ALTER TABLE students ENABLE ROW LEVEL SECURITY; ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE school_contracts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE school_consultations ENABLE ROW LEVEL SECURITY; ALTER TABLE school_consultation_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_open ON school_consultations FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legacy_open ON school_consultation_requests FOR ALL TO authenticated USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid FROM generate_series(10,17) value;
    INSERT INTO organizations VALUES ('${id(1)}','school','{"school_family_portal":true}'), ('${id(2)}','school','{}');
    INSERT INTO organization_admins VALUES ('${id(1)}','${id(13)}');
    INSERT INTO profiles VALUES ('${id(12)}','${id(1)}','psychologist'), ('${id(16)}','${id(1)}','psychologist');
    INSERT INTO students(id,organization_id,linked_user_id,full_name) VALUES ('${id(20)}','${id(1)}','${id(11)}','A'),('${id(21)}','${id(1)}','${id(17)}','B');
    INSERT INTO school_contracts(id,organization_id,student_id,kind,signing_status) VALUES ('${id(60)}','${id(1)}','${id(20)}','annual','signed'),('${id(61)}','${id(1)}','${id(21)}','annual','signed');
  `);
  await db.exec(readFileSync('supabase/migrations/20260928190000_school_family_account_workflow.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260928190200_school_family_consultation_privacy.sql', 'utf8'));
  await db.exec(`
    INSERT INTO school_family_guardians(organization_id,student_id,annual_contract_id,guardian_user_id,guardian_name,guardian_email,identity_hash,evidence_source,verified_by)
      VALUES ('${id(1)}','${id(20)}','${id(60)}','${id(10)}','Parent A','parent-a@example.test',repeat('a',64),'admin_verified','${id(13)}'),
        ('${id(1)}','${id(21)}','${id(61)}','${id(14)}','Parent B','parent-b@example.test',repeat('b',64),'admin_verified','${id(13)}');
    INSERT INTO school_consultations(id,organization_id,student_id,tutor_id,kind,help_team_category,target_kind,family_student_ids)
      VALUES ('${id(30)}','${id(1)}','${id(20)}','${id(12)}','help_team','psychologist','child','{}'),
        ('${id(31)}','${id(1)}','${id(20)}','${id(12)}','help_team','psychologist','family','{${id(20)},${id(21)}}'),
        ('${id(32)}','${id(1)}','${id(21)}','${id(12)}','help_team','psychologist','child','{}'),
        ('${id(33)}','${id(2)}','${id(20)}','${id(12)}','help_team','psychologist','child','{}');
    INSERT INTO school_consultation_notes(id,consultation_id,organization_id,author_user_id,body)
      VALUES ('${id(70)}','${id(30)}','${id(1)}','${id(12)}','Child A private'),
        ('${id(71)}','${id(31)}','${id(1)}','${id(16)}','Family private'),
        ('${id(72)}','${id(32)}','${id(1)}','${id(16)}','Child B private');
  `);
  return db;
}
async function asUser(db: PGlite, user: number) {
  await db.exec(`RESET ROLE; SET test.viewer_id='${id(user)}'; SET ROLE authenticated;`);
}
async function visibleNoteIds(db: PGlite) {
  return (await db.query<{ id: string }>('SELECT id::text FROM school_consultation_notes ORDER BY id')).rows.map(row => row.id);
}

it('enforces parent/specialist-only note reads even with a broad historical booking policy', async () => {
  const db = await privacyDatabase();
  try {
    await asUser(db, 10);
    expect(await visibleNoteIds(db)).toEqual([70, 71].map(id));
    await asUser(db, 14);
    expect(await visibleNoteIds(db)).toEqual([71, 72].map(id));
    await asUser(db, 11);
    expect(await visibleNoteIds(db)).toEqual([]);
    expect((await db.query('SELECT id FROM school_consultations WHERE organization_id=$1', [id(1)])).rows).toEqual([]);
    expect((await db.query('SELECT id FROM school_consultations WHERE organization_id=$1', [id(2)])).rows).toHaveLength(1);
    await asUser(db, 13);
    expect((await db.query('SELECT id FROM school_consultations WHERE organization_id=$1', [id(1)])).rows).toHaveLength(3);
    expect(await visibleNoteIds(db)).toEqual([]);
    await asUser(db, 12);
    expect(await visibleNoteIds(db)).toEqual([70, 71, 72].map(id));
    const syntheticCode = 'QA-SYNTHETIC-CODE';
    const codeHash = createHash('sha256').update(syntheticCode).digest('hex');
    await db.exec(`RESET ROLE;
      INSERT INTO school_contract_signatures(id,contract_id,role,status,signer_email,signer_name,signer_personal_code)
        VALUES('${id(62)}','${id(60)}','parent_primary','signed','parent-a@example.test','Parent A','${syntheticCode}');
      UPDATE school_family_guardians SET evidence_source='signed_primary',signature_id='${id(62)}',signature_personal_code_hash='${codeHash}' WHERE student_id='${id(20)}';`);
    await asUser(db, 10);
    expect(await visibleNoteIds(db)).toEqual([70, 71].map(id));
    await db.exec(`RESET ROLE; UPDATE school_contract_signatures SET signer_personal_code='changed' WHERE id='${id(62)}';`);
    await asUser(db, 10);
    expect(await visibleNoteIds(db)).toEqual([]);
    await db.exec(`RESET ROLE; UPDATE school_contract_signatures SET signer_personal_code='${syntheticCode}' WHERE id='${id(62)}';`);
    await db.exec(`RESET ROLE; UPDATE school_contracts SET terminated_at=now() WHERE id='${id(60)}';`);
    await asUser(db, 10);
    expect(await visibleNoteIds(db)).toEqual([]);
    await db.exec(`RESET ROLE; UPDATE school_contracts SET terminated_at=NULL WHERE id='${id(60)}'; UPDATE students SET linked_user_id='${id(10)}' WHERE id='${id(21)}';`);
    await asUser(db, 10);
    expect(await visibleNoteIds(db)).toEqual([]);
  } finally { await db.close(); }
}, 30_000);

it('permits specialist own-note editing but prevents forged authors, scope changes, and booking privilege escalation', async () => {
  const db = await privacyDatabase();
  try {
    await asUser(db, 10);
    await expect(db.exec(`INSERT INTO school_consultation_notes(consultation_id,organization_id,author_user_id,body) VALUES('${id(30)}','${id(1)}','${id(10)}','Parent edit')`)).rejects.toThrow('row-level security');
    await asUser(db, 13);
    expect((await db.query(`UPDATE school_consultations SET tutor_id='${id(16)}' WHERE id='${id(30)}' RETURNING id`)).rows).toEqual([]);
    await asUser(db, 12);
    await db.exec(`UPDATE school_consultation_notes SET body='Own edit' WHERE id='${id(70)}';`);
    expect((await db.query('SELECT body FROM school_consultation_notes WHERE id=$1', [id(70)])).rows[0]).toEqual({ body: 'Own edit' });
    expect((await db.query(`UPDATE school_consultation_notes SET body='Overwrite previous author' WHERE id='${id(71)}' RETURNING id`)).rows).toEqual([]);
    await db.exec(`INSERT INTO school_consultation_notes(consultation_id,organization_id,author_user_id,body) VALUES('${id(31)}','${id(1)}','${id(12)}','New specialist own note')`);
    await expect(db.exec(`INSERT INTO school_consultation_notes(consultation_id,organization_id,author_user_id,body) VALUES('${id(32)}','${id(1)}','${id(14)}','Forged author')`)).rejects.toThrow('row-level security');
    await expect(db.exec(`INSERT INTO school_consultation_notes(consultation_id,organization_id,author_user_id,body) VALUES('${id(32)}','${id(2)}','${id(12)}','Wrong organization')`)).rejects.toThrow('row-level security');
    await expect(db.exec(`UPDATE school_consultation_notes SET consultation_id='${id(32)}' WHERE id='${id(70)}'`)).rejects.toThrow('scope and author cannot change');
    await db.exec(`RESET ROLE; UPDATE school_consultations SET tutor_id='${id(16)}' WHERE id='${id(30)}';`);
    await asUser(db, 12);
    expect((await db.query('SELECT id FROM school_consultation_notes WHERE consultation_id=$1', [id(30)])).rows).toEqual([]);
    await asUser(db, 16);
    expect((await db.query('SELECT body FROM school_consultation_notes WHERE consultation_id=$1', [id(30)])).rows).toEqual([{ body: 'Own edit' }]);
    expect((await db.query(`UPDATE school_consultation_notes SET body='Reassigned edit' WHERE id='${id(70)}' RETURNING id`)).rows).toEqual([]);
    await db.exec(`RESET ROLE; UPDATE organizations SET features='{}' WHERE id='${id(1)}';`);
    await asUser(db, 16);
    expect(await visibleNoteIds(db)).toEqual([]);
  } finally { await db.close(); }
}, 30_000);
