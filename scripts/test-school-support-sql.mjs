import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE organizations(id uuid PRIMARY KEY, entity_type text, features jsonb);
CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid, email text, reminder_student_hours numeric, reminder_tutor_hours numeric);
CREATE TABLE students(id uuid PRIMARY KEY, organization_id uuid, email text, payer_email text, parent_secondary_email text, payment_payer text);
CREATE TABLE sessions(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, status text, start_time timestamptz, reminder_student_sent boolean, reminder_tutor_sent boolean, reminder_payer_sent boolean);
CREATE TABLE parent_students(student_id uuid, parent_id uuid);
CREATE TABLE parent_profiles(id uuid, email text, disable_lesson_reminders boolean);
CREATE TABLE school_class_group_members(group_id uuid,student_id uuid);
`);
for (const name of ['20260908080306_school_reminder_recipient_parity.sql','20260908080341_school_member_schedule.sql','20260908081019_session_storage_lookup_index.sql']) {
  await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await db.query('insert into organizations values ($1,$2,$3)',[id(1),'school',{}]);
await db.query('insert into profiles values ($1,$2,$3,6,0)',[id(2),id(1),'teacher@example.test']);
await db.query('insert into students values ($1,$2,null,$3,null,$4)',[id(3),id(1),'parent@example.test','student']);
await db.query("insert into sessions values ($1,$2,$3,'active',now()+interval '1 hour',false,true,false)",[id(4),id(2),id(3)]);
assert.equal((await db.query('select * from get_due_session_reminder_ids()')).rows.length,1,'no-email school child must reach payer queue');
await db.query('update students set email=$1',['child@example.test']);
await db.exec('update sessions set reminder_student_sent=true');
assert.equal((await db.query('select * from get_due_session_reminder_ids()')).rows.length,0,'school student already reminded must not remain in payer queue');
await db.exec("update students set email=null,payer_email=null,parent_secondary_email='second@example.test'");
assert.equal((await db.query('select * from get_due_session_reminder_ids()')).rows.length,1);
for (const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from get_due_session_reminder_ids()'),/permission denied/);
  await db.exec('reset role');
}
await db.exec('set enable_seqscan=off');
const plan=await db.query('explain select tutor_id,student_id from sessions where id::text=$1',[id(4)]);
assert.match(JSON.stringify(plan.rows),/sessions_storage_folder_lookup_idx/);
console.log('School reminder recipient parity, private RPC access, member column and storage index plan: passed.');
await db.close();
