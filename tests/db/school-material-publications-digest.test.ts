// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const uid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const org = uid(1), otherOrg = uid(2), childA = uid(101), childB = uid(102), soloChild = uid(103), detachedChild = uid(104), outsider = uid(201);
const teacher = uid(50), group = uid(70), subject = uid(60), lessonA = uid(1001), lessonB = uid(1002), lessonDetached = uid(1004);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA storage;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY,entity_type text,features jsonb);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,organization_id uuid,email text,reminder_student_hours numeric,reminder_tutor_hours numeric);
    CREATE TABLE public.students(id uuid PRIMARY KEY,organization_id uuid,email text,payer_email text,parent_secondary_email text,payment_payer text,linked_user_id uuid,detached_at timestamptz,enrollment_status text);
    CREATE TABLE public.parent_profiles(id uuid PRIMARY KEY,email text,disable_lesson_reminders boolean);
    CREATE TABLE public.parent_students(student_id uuid,parent_id uuid);
    CREATE TABLE public.school_contracts(id uuid PRIMARY KEY,organization_id uuid,student_id uuid,kind text,signing_status text,archived_at timestamptz,terminated_at timestamptz);
    CREATE TABLE public.school_family_guardians(organization_id uuid,student_id uuid,guardian_user_id uuid,annual_contract_id uuid,guardian_email text,evidence_source text,signature_id uuid,guardian_name text,signature_personal_code_hash text);
    CREATE TABLE public.school_family_accounts(organization_id uuid,user_id uuid,role text);
    CREATE TABLE public.school_contract_signatures(id uuid PRIMARY KEY,contract_id uuid,role text,status text,signer_email text,signer_name text,signer_personal_code text);
    CREATE TABLE public.sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,class_group_id uuid,start_time timestamptz,status text,
      tutor_comment text,show_comment_to_student boolean,show_comment_to_parent boolean,topic text,
      reminder_student_sent boolean,reminder_tutor_sent boolean,reminder_payer_sent boolean);
    CREATE TABLE public.school_class_group_members(group_id uuid,student_id uuid);
    CREATE TABLE public.recurring_individual_sessions(subject_id uuid,tutor_id uuid,student_id uuid,active boolean);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    INSERT INTO organizations VALUES ('${org}','school','{}'),('${otherOrg}','school','{"school_family_portal":true}');
    INSERT INTO profiles VALUES ('${teacher}','${org}','teacher@school.invalid',2,2);
    INSERT INTO students(id,organization_id,email,enrollment_status) VALUES
      ('${childA}','${org}','child@school.test','active'),('${childB}','${org}','st-child@account.invalid','active'),
      ('${soloChild}','${org}',NULL,'active'),('${detachedChild}','${org}',NULL,'active'),('${outsider}','${otherOrg}',NULL,'active');
    UPDATE students SET detached_at=now() WHERE id='${detachedChild}';
    INSERT INTO sessions(id,student_id,tutor_id,class_group_id,start_time,status) VALUES
      ('${lessonA}','${childA}','${teacher}','${group}',now(),'active'),
      ('${lessonB}','${childB}','${teacher}','${group}',now(),'active'),
      ('${lessonDetached}','${detachedChild}','${teacher}','${group}',now(),'active');
    INSERT INTO school_class_group_members VALUES ('${group}','${childA}'),('${group}','${childB}'),('${group}','${detachedChild}');
    INSERT INTO recurring_individual_sessions VALUES ('${subject}','${teacher}','${soloChild}',true),('${subject}','${teacher}','${childB}',false);
    INSERT INTO storage.objects(bucket_id,name,created_at,updated_at) VALUES ('session-files','${lessonA}/old.pdf',now()-interval '1 day',now()-interval '1 day');
  `);
  await db.exec(readFileSync('supabase/migrations/20260928190300_school_material_publications_digest.sql', 'utf8'));
  return db;
}

it('publishes versions atomically, restricts live multirow group audiences and keeps student submissions private', async () => {
  const db = await database();
  try {
    expect((await db.query(`SELECT school_baseline_session_materials($1) AS count`, [org])).rows[0]).toEqual({ count: 1 });
    await db.query(`UPDATE organizations SET features='{"school_family_portal":true}' WHERE id=$1`, [org]);
    await expect(db.query(`SELECT school_baseline_session_materials($1)`, [org])).rejects.toThrow('Disable family portal');
    await db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES ('session-files','${lessonA}/new.pdf'),('session-files','${lessonA}/nd-answer.pdf'),('other-bucket','${lessonA}/irrelevant.pdf');
      UPDATE sessions SET tutor_comment='For child only',show_comment_to_student=true,show_comment_to_parent=false,topic='Private child task' WHERE id='${lessonA}';
      UPDATE sessions SET tutor_comment='For alias child only',show_comment_to_student=true,show_comment_to_parent=false,topic='Never send parent' WHERE id='${lessonB}';
      INSERT INTO school_material_publications(organization_id,source,target_id,file_id,source_version,label,source_created_at) VALUES
        ('${org}','drive','${group}','group-video','v1','Group video',now()),
        ('${org}','drive','subject:${subject}','individual-video','v1','Individual video',now()),
        ('${org}','drive','${group}','expired-video','v1','Expired video',now()-interval '40 days'),
        ('${org}','drive','missing-group','orphan-video','v1','Orphan video',now());`);
    const audience = async () => (await db.query<{ file_id: string; student_id: string }>(`SELECT p.file_id,a.student_id::text
      FROM school_pending_material_audience(1000) a JOIN school_material_publications p ON p.id=a.publication_id`)).rows;
    const pairs = await audience();
    const readers = (file: string) => pairs.filter((row) => row.file_id === file).map((row) => row.student_id).sort();
    expect(readers(`${lessonA}/new.pdf`)).toEqual([childA, childB]);
    expect(readers(`${lessonA}/old.pdf`)).toEqual([]);
    expect(readers(`${lessonA}/nd-answer.pdf`)).toEqual([]);
    expect(readers(`${lessonA}/comment`)).toEqual([childA]);
    expect(readers(`${lessonB}/comment`)).toEqual([]);
    expect(readers('group-video')).toEqual([childA, childB]);
    expect(readers('individual-video')).toEqual([soloChild]);
    expect(readers('expired-video')).toEqual([]);
    expect(readers('orphan-video')).toEqual([]);
    await db.exec(`DELETE FROM school_class_group_members WHERE student_id='${childA}';`);
    expect((await audience()).filter((row) => row.file_id === `${lessonA}/new.pdf`).map((row) => row.student_id)).toEqual([childB]);
    await db.exec(`UPDATE storage.objects SET updated_at=now() WHERE name='${lessonA}/old.pdf';`);
    const versions = (await db.query<{ legacy_access: boolean }>(`SELECT legacy_access FROM school_material_publications WHERE file_id=$1 ORDER BY first_published_at`, [`${lessonA}/old.pdf`])).rows;
    expect(versions.map((row) => row.legacy_access)).toEqual([true, false]);
  } finally { await db.close(); }
}, 30_000);

it('keeps publication tables and RPCs server-only, rolls invalid reservations back, and leases each daily digest once', async () => {
  const db = await database();
  try {
    for (const table of ['school_material_publications','school_material_baselines','school_material_digest_entries','school_material_digest_deliveries']) {
      const privileges = (await db.query(`SELECT relrowsecurity AS rls,
        has_table_privilege('authenticated',oid,'SELECT') AS user_select,
        has_table_privilege('anon',oid,'SELECT') AS public_select,
        has_table_privilege('service_role',oid,'INSERT') AS service_insert FROM pg_class WHERE oid=$1::regclass`, [`public.${table}`])).rows[0];
      expect(privileges).toEqual({ rls: true, user_select: false, public_select: false, service_insert: true });
    }
    for (const signature of ['school_baseline_session_materials(uuid)','school_pending_material_audience(integer)','school_claim_material_digest(uuid)','school_reserve_material_digest(uuid,text,date,jsonb,jsonb)','get_due_session_reminder_ids(integer)']) {
      expect((await db.query(`SELECT has_function_privilege('anon',$1,'EXECUTE') AS public_execute,
        has_function_privilege('authenticated',$1,'EXECUTE') AS user_execute,
        has_function_privilege('service_role',$1,'EXECUTE') AS service_execute`, [`public.${signature}`])).rows[0])
        .toEqual({ public_execute: false, user_execute: false, service_execute: true });
    }
    const publication = uid(900);
    await db.exec(`INSERT INTO school_material_publications(id,organization_id,source,target_id,file_id,source_version,label) VALUES
      ('${publication}','${org}','session_file','${lessonA}','${lessonA}/teacher.pdf','v1','teacher.pdf');
      INSERT INTO school_material_digest_entries(publication_id,student_id) VALUES ('${publication}','${childA}');`);
    const reserve = (email: string, student: string) => db.query<{ id: string }>(`SELECT school_reserve_material_digest($1,$2,CURRENT_DATE,'{"items":[]}', $3::jsonb) AS id`,
      [org, email, JSON.stringify([{ publication_id: publication, student_id: student }])]);
    const first = (await reserve('guardian@school.test', childA)).rows[0].id;
    expect((await reserve('guardian@school.test', childA)).rows[0].id).toBe(first);
    const nextDay = await db.query(`SELECT school_reserve_material_digest($1,$2,CURRENT_DATE+1,'{"items":[]}', $3::jsonb) AS id`,
      [org, 'guardian@school.test', JSON.stringify([{ publication_id: publication, student_id: childA }])]);
    expect(nextDay.rows[0]).toEqual({ id: null });
    await expect(reserve('other@school.test', outsider)).rejects.toThrow('digest_invalid_entries');
    expect((await db.query(`SELECT count(*)::integer AS count FROM school_material_digest_deliveries`)).rows[0]).toEqual({ count: 1 });
    expect((await db.query(`SELECT delivery_id::text,state FROM school_material_digest_entries`)).rows[0]).toEqual({ delivery_id: first, state: 'queued' });
    const claim = async () => (await db.query<{ claimed: boolean }>(`SELECT school_claim_material_digest($1) AS claimed`, [first])).rows[0].claimed;
    expect(await claim()).toBe(true); expect(await claim()).toBe(false);
    await db.query(`UPDATE school_material_digest_deliveries SET lease_at=now()-interval '11 minutes' WHERE id=$1`, [first]);
    expect(await claim()).toBe(true); expect(await claim()).toBe(false);
    await db.query(`UPDATE school_material_digest_deliveries SET lease_at=now()-interval '11 minutes',attempted_at=now()-interval '24 hours' WHERE id=$1`, [first]);
    expect(await claim()).toBe(false);
    await db.query(`UPDATE school_material_digest_deliveries SET state='sent' WHERE id=$1`, [first]);
    expect(await claim()).toBe(false);
  } finally { await db.close(); }
}, 30_000);

it('requires completed legacy inventory and separate verified parent/student accounts before enabling the family portal', async () => {
  const db = await database();
  try {
    const parentUser = uid(401), studentUser = uid(402), annual = uid(403), signature = uid(404);
    const readiness = async () => (await db.query<{ result: { baselineReady: boolean; eligibleCount: number; pendingCount: number } }>(
      'SELECT school_family_portal_readiness($1) AS result', [org])).rows[0].result;
    await db.exec(`INSERT INTO school_contracts VALUES ('${annual}','${org}','${childA}','annual','signed',NULL,NULL);`);
    expect(await readiness()).toEqual({ baselineReady: false, eligibleCount: 1, pendingCount: 1 });
    await db.exec(`INSERT INTO school_material_baselines(organization_id,completed_at) VALUES ('${org}',now());
      UPDATE students SET linked_user_id='${studentUser}' WHERE id='${childA}';
      INSERT INTO school_family_accounts VALUES ('${org}','${studentUser}','student'),('${org}','${parentUser}','parent');
      INSERT INTO school_contract_signatures VALUES ('${signature}','${annual}','parent_primary','signed','guardian@school.test','Verified Parent','39901010000');
      INSERT INTO school_family_guardians VALUES ('${org}','${childA}','${parentUser}','${annual}','guardian@school.test','signed_primary','${signature}','Verified Parent',encode(sha256(convert_to('39901010000','UTF8')),'hex'));`);
    expect(await readiness()).toEqual({ baselineReady: true, eligibleCount: 1, pendingCount: 0 });
    await db.exec(`UPDATE school_contract_signatures SET signer_email='another@school.test' WHERE id='${signature}';`);
    expect((await readiness()).pendingCount).toBe(1);
    await db.exec(`UPDATE school_contract_signatures SET signer_email='guardian@school.test' WHERE id='${signature}';
      UPDATE students SET linked_user_id='${parentUser}' WHERE id='${childB}';`);
    expect((await readiness()).pendingCount).toBe(1);
  } finally { await db.close(); }
}, 30_000);
