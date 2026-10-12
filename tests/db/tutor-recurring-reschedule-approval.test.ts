// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MOKSLO_VAISIAI_ORG_ID as org, MOKSLO_VAISIAI_DEMO_ORG_ID as demo } from '../../src/lib/marketMoney';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tutor = id(1), child = id(2), subject = id(3), recurring = id(4), lesson = id(5), next = id(6), otherOrg = id(7);
const oldStart = '2030-10-22T10:00:00Z', oldEnd = '2030-10-22T11:00:00Z';
const newStart = '2030-10-23T12:00:00Z', newEnd = '2030-10-23T13:00:00Z';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE organizations (id uuid PRIMARY KEY, entity_type text DEFAULT 'company', features jsonb);
    CREATE TABLE profiles (id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE subjects (id uuid PRIMARY KEY, is_group boolean DEFAULT false);
    CREATE TABLE students (id uuid PRIMARY KEY, organization_id uuid, full_name text,
      payer_email text, email text, payment_payer text DEFAULT 'parent', parent_user_id uuid);
    CREATE TABLE parent_profiles (user_id uuid, email text);
    CREATE TABLE session_recurrence_exclusions (id uuid DEFAULT gen_random_uuid(), recurring_session_id uuid, start_time timestamptz, scope text);
    CREATE UNIQUE INDEX exclusions_unique ON session_recurrence_exclusions(recurring_session_id,scope,start_time);
    CREATE TABLE organization_admins (user_id uuid, organization_id uuid, status text, accepted_at timestamptz, role text, permissions jsonb);
    CREATE TABLE recurring_individual_sessions (id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, subject_id uuid,
      day_of_week integer, start_time time, end_time time, start_date date, end_date date, active boolean DEFAULT true,
      frequency text DEFAULT 'weekly', meeting_link text, topic text, price numeric,
      last_materialized_at timestamptz, updated_at timestamptz, created_at timestamptz);
    CREATE TABLE sessions (id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, subject_id uuid, recurring_session_id uuid,
      lesson_package_id uuid, start_time timestamptz, end_time timestamptz, status text DEFAULT 'active',
      original_start_time timestamptz, rescheduled_at timestamptz, reschedule_reason text, reschedule_requested_by text,
      topic text, meeting_link text, price numeric, tutor_comment text, show_comment_to_student boolean, show_comment_to_parent boolean);
    INSERT INTO organizations(id, features) VALUES ('${org}', '{"public_name":"MV"}'), ('${demo}', '{}'), ('${otherOrg}', '{}');
  `);
  await db.exec(readFileSync('supabase/migrations/20261012104626_tutor_recurring_reschedule_approval.sql', 'utf8'));
  await db.exec(`GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT, UPDATE ON sessions, recurring_individual_sessions TO authenticated;`);
}, 30_000);
beforeEach(async () => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  await db.exec(`
    TRUNCATE lesson_reschedule_requests, profiles, subjects, students, parent_profiles, organization_admins, recurring_individual_sessions, sessions, session_recurrence_exclusions CASCADE;
    UPDATE organizations SET features = CASE WHEN id IN ('${org}', '${demo}') THEN '{"tutor_recurring_reschedule_approval":true}'::jsonb ELSE '{}'::jsonb END;
    INSERT INTO profiles VALUES ('${tutor}', '${org}');
    INSERT INTO subjects(id) VALUES ('${subject}');
    INSERT INTO students(id, organization_id, full_name, payer_email) VALUES ('${child}', '${org}', 'Ona', 'parent@example.com');
    INSERT INTO recurring_individual_sessions(id,tutor_id,student_id,subject_id,day_of_week,start_time,end_time,start_date,price)
      VALUES ('${recurring}','${tutor}','${child}','${subject}',2,'13:00','14:00','2030-10-22',20);
    INSERT INTO sessions(id,tutor_id,student_id,subject_id,recurring_session_id,start_time,end_time,price) VALUES
      ('${lesson}','${tutor}','${child}','${subject}','${recurring}','${oldStart}','${oldEnd}',20),
      ('${next}','${tutor}','${child}','${subject}','${recurring}','2030-10-29T11:00:00Z','2030-10-29T12:00:00Z',20);
  `);
});
afterAll(async () => { await db?.close(); });

async function propose(scope = 'single', start = newStart, end = newEnd, fields = {}) {
  const result = await db.query<{ request: string }>(`SELECT public.create_lesson_reschedule_request(
    $1,$2,$3,$4,$5,$6,$7,'Keičiamas darbo grafikas','tutor',$8,false) AS request`,
    [tutor, lesson, oldStart, oldEnd, start, end, scope, JSON.stringify(fields)]);
  await db.query('UPDATE lesson_reschedule_requests SET email_ready=true WHERE id=$1', [result.rows[0].request]);
  return result.rows[0].request;
}
async function answer(request: string, decision = 'approved', email = 'parent@example.com') {
  return (await db.query<{ result: { status: string; changed: boolean } }>(
    `SELECT public.respond_lesson_reschedule_request($1,$2,$3) AS result`, [request, email, decision])).rows[0].result;
}
async function starts() {
  return (await db.query<{ id: string; start: string }>(`SELECT id, to_char(start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS start FROM sessions ORDER BY id`)).rows;
}

describe('tutor recurring reschedule approval', () => {
  it('enables the flag only for MV and its demo', async () => {
    const rows = (await db.query<{ id: string; enabled: string }>(`SELECT id, features->>'tutor_recurring_reschedule_approval' AS enabled FROM organizations`)).rows;
    expect(rows.find(r => r.id === org)?.enabled).toBe('true');
    expect(rows.find(r => r.id === demo)?.enabled).toBe('true');
    expect(rows.find(r => r.id === otherOrg)?.enabled).toBeNull();
  });
  it('keeps the booking and other edits unchanged until the parent approves', async () => {
    const request = await propose('single', newStart, newEnd, { topic: 'Nauja tema' });
    expect((await starts()).find(r => r.id === lesson)?.start).toBe(oldStart);
    expect((await db.query<{ topic: string }>('SELECT topic FROM sessions WHERE id=$1', [lesson])).rows[0].topic).toBeNull();
    expect(await answer(request)).toEqual({ status: 'approved', changed: true });
    expect((await starts()).find(r => r.id === lesson)?.start).toBe(newStart);
    expect((await starts()).find(r => r.id === next)?.start).toBe('2030-10-29T11:00:00Z');
    const template = (await db.query<{ start_time: string }>('SELECT start_time FROM recurring_individual_sessions')).rows[0];
    expect(template.start_time).toBe('13:00:00');
    expect((await db.query<{ topic: string }>('SELECT topic FROM sessions WHERE id=$1', [lesson])).rows[0].topic).toBe('Nauja tema');
    expect(await answer(request)).toEqual({ status: 'approved', changed: false });
    expect(await answer(request, 'rejected')).toEqual({ status: 'approved', changed: false });
  });
  it('leaves both occurrences and the template unchanged when declined', async () => {
    const request = await propose('future');
    expect(await answer(request, 'rejected')).toEqual({ status: 'rejected', changed: true });
    expect((await starts()).map(r => r.start)).toEqual([oldStart, '2030-10-29T11:00:00Z']);
    expect(await answer(request)).toEqual({ status: 'rejected', changed: false });
  });
  it('moves future occurrences and the rolling template at the same local time across DST', async () => {
    const request = await propose('future');
    // A new occurrence is materialized while the unchanged proposal is pending.
    await db.exec(`INSERT INTO sessions(id,tutor_id,student_id,subject_id,recurring_session_id,start_time,end_time,price)
      VALUES ('${id(8)}','${tutor}','${child}','${subject}','${recurring}','2030-11-05T11:00:00Z','2030-11-05T12:00:00Z',20);`);
    await answer(request);
    expect((await starts()).map(r => r.start)).toEqual([newStart, '2030-10-30T13:00:00Z', '2030-11-06T13:00:00Z']);
    const template = (await db.query<{ day_of_week: number; start_time: string }>('SELECT day_of_week, start_time FROM recurring_individual_sessions')).rows[0];
    expect(template).toEqual({ day_of_week: 3, start_time: '15:00:00' });
  });
  it('checks conflicts again at approval and rolls back the entire series and answer', async () => {
    const request = await propose('future');
    await db.exec(`INSERT INTO sessions(id,tutor_id,student_id,start_time,end_time) VALUES
      ('${id(9)}','${tutor}','${child}','2030-10-30T13:30:00Z','2030-10-30T14:30:00Z');`);
    await expect(answer(request)).rejects.toMatchObject({ message: 'reschedule_conflict' });
    expect((await starts()).find(r => r.id === lesson)?.start).toBe(oldStart);
    expect((await db.query<{ status: string }>('SELECT status FROM lesson_reschedule_recipients')).rows[0].status).toBe('pending');
  });
  it('keeps month-end series aligned with their new rolling template', async () => {
    await db.exec(`UPDATE recurring_individual_sessions SET frequency='monthly', start_date='2030-10-31';
      UPDATE sessions SET start_time='2030-10-31T11:00:00Z',end_time='2030-10-31T12:00:00Z' WHERE id='${lesson}';
      UPDATE sessions SET start_time='2030-11-30T11:00:00Z',end_time='2030-11-30T12:00:00Z' WHERE id='${next}';`);
    const request = (await db.query<{ id: string }>(`SELECT public.create_lesson_reschedule_request(
      $1,$2,'2030-10-31T11:00:00Z','2030-10-31T12:00:00Z','2030-11-01T11:00:00Z','2030-11-01T12:00:00Z',
      'future','Keičiamas darbo grafikas','tutor') AS id`, [tutor, lesson])).rows[0].id;
    await db.query('UPDATE lesson_reschedule_requests SET email_ready=true WHERE id=$1', [request]);
    await answer(request);
    expect((await starts()).map(r => r.start)).toEqual(['2030-11-01T11:00:00Z', '2030-12-01T11:00:00Z']);
  });
  it('preserves cancellations and deletion exclusions on the moved future schedule', async () => {
    await db.exec(`INSERT INTO sessions(id,tutor_id,student_id,subject_id,recurring_session_id,start_time,end_time,status)
      VALUES ('${id(15)}','${tutor}','${child}','${subject}','${recurring}','2030-11-05T11:00:00Z','2030-11-05T12:00:00Z','cancelled');
      INSERT INTO session_recurrence_exclusions(recurring_session_id,start_time,scope) VALUES ('${recurring}','2030-11-12T11:00:00Z','single');`);
    await answer(await propose('future'));
    expect((await starts()).find(r => r.id === id(15))?.start).toBe('2030-11-06T13:00:00Z');
    expect((await db.query<{ status: string }>('SELECT status FROM sessions WHERE id=$1', [id(15)])).rows[0].status).toBe('cancelled');
    expect(new Date((await db.query<{ start_time: Date }>('SELECT start_time FROM session_recurrence_exclusions')).rows[0].start_time).toISOString()).toBe('2030-11-13T13:00:00.000Z');
  });
  it('shifts adjacent deletion exclusions without hitting their unique constraint', async () => {
    await db.exec(`INSERT INTO session_recurrence_exclusions(recurring_session_id,start_time,scope) VALUES
      ('${recurring}','2030-11-05T11:00:00Z','single'), ('${recurring}','2030-11-12T11:00:00Z','single');`);
    await answer(await propose('future', '2030-10-29T11:00:00Z', '2030-10-29T12:00:00Z'));
    const exclusions = (await db.query<{ start_time: Date }>('SELECT start_time FROM session_recurrence_exclusions ORDER BY start_time')).rows;
    expect(exclusions.map(r => new Date(r.start_time).toISOString())).toEqual(['2030-11-12T11:00:00.000Z', '2030-11-19T11:00:00.000Z']);
  });
  it('does not overwrite a later lesson edit or changed client contact', async () => {
    const request = await propose();
    await db.query('UPDATE sessions SET topic=$1 WHERE id=$2', ['Kita tema', lesson]);
    await expect(answer(request)).rejects.toMatchObject({ message: 'reschedule_changed' });
    await db.query('UPDATE sessions SET topic=NULL WHERE id=$1', [lesson]);
    await db.query('UPDATE students SET payer_email=$1 WHERE id=$2', ['new-parent@example.com', child]);
    await expect(answer(request)).rejects.toMatchObject({ message: 'reschedule_changed' });
    expect((await starts()).find(r => r.id === lesson)?.start).toBe(oldStart);
  });
  it('expires unanswered requests and refuses an unknown recipient', async () => {
    const request = await propose();
    await expect(answer(request, 'approved', 'other@example.com')).rejects.toMatchObject({ message: 'reschedule_unavailable' });
    await db.query(`UPDATE lesson_reschedule_requests SET expires_at=now()-interval '1 minute' WHERE id=$1`, [request]);
    expect(await answer(request)).toEqual({ status: 'expired', changed: true });
    expect((await starts()).find(r => r.id === lesson)?.start).toBe(oldStart);
  });
  it('does not let a partially delivered group proposal apply the move', async () => {
    const request = await propose();
    await db.query('UPDATE lesson_reschedule_requests SET email_ready=false WHERE id=$1', [request]);
    await expect(answer(request)).rejects.toMatchObject({ message: 'reschedule_unavailable' });
    expect((await starts()).find(r => r.id === lesson)?.start).toBe(oldStart);
  });
  it('rejects duplicate pending proposals, missing contacts and unrelated organizations', async () => {
    await db.query('UPDATE students SET payer_email=NULL WHERE id=$1', [child]);
    await expect(propose()).rejects.toMatchObject({ message: 'reschedule_no_contact' });
    expect((await db.query('SELECT * FROM lesson_reschedule_requests')).rows).toHaveLength(0);
    await db.query('UPDATE students SET payer_email=$1 WHERE id=$2', ['parent@example.com', child]);
    await propose();
    await expect(propose('future')).rejects.toMatchObject({ message: 'reschedule_pending' });
    await db.query('UPDATE profiles SET organization_id=$1 WHERE id=$2', [otherOrg, tutor]);
    await expect(propose()).rejects.toMatchObject({ message: 'reschedule_unavailable' });
  });
  it.each(['approved', 'rejected'])('requires all group clients to answer before the final %s decision', async (decision) => {
    await db.exec(`UPDATE subjects SET is_group=true;
      INSERT INTO students(id,organization_id,full_name,payer_email) VALUES ('${id(10)}','${org}','Jonas','parent2@example.com');
      INSERT INTO recurring_individual_sessions(id,tutor_id,student_id,subject_id,day_of_week,start_time,end_time,start_date)
        VALUES ('${id(11)}','${tutor}','${id(10)}','${subject}',2,'13:00','14:00','2030-10-22');
      INSERT INTO sessions(id,tutor_id,student_id,subject_id,recurring_session_id,start_time,end_time)
        VALUES ('${id(12)}','${tutor}','${id(10)}','${subject}','${id(11)}','${oldStart}','${oldEnd}');`);
    const request = await propose();
    expect(await answer(request)).toEqual({ status: 'pending', changed: true });
    expect((await starts()).find(r => r.id === lesson)?.start).toBe(oldStart);
    expect(await answer(request, decision, 'parent2@example.com')).toEqual({ status: decision, changed: true });
    expect((await starts()).find(r => r.id === id(12))?.start).toBe(decision === 'approved' ? newStart : oldStart);
  });
  it('blocks direct tutor moves but preserves one-off, parent, admin and other-org edits', async () => {
    await db.exec(`SET ROLE authenticated`);
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [tutor]);
    await expect(db.query('UPDATE sessions SET start_time=$1 WHERE id=$2', [newStart, lesson]))
      .rejects.toMatchObject({ code: '42501', message: 'reschedule_approval_required' });
    await expect(db.exec(`UPDATE recurring_individual_sessions SET start_time='15:00'`))
      .rejects.toMatchObject({ code: '42501', message: 'reschedule_approval_required' });
    await expect(db.query(`SELECT public.respond_lesson_reschedule_request($1,'parent@example.com','approved')`, [id(13)]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('SELECT * FROM lesson_reschedule_requests')).rejects.toMatchObject({ code: '42501' });
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [id(14)]); // Parent remains allowed by existing RLS.
    await db.query('UPDATE sessions SET start_time=$1 WHERE id=$2', [newStart, lesson]);
    await db.exec('RESET ROLE');
    await db.query(`SELECT set_config('request.jwt.claim.sub','',false)`);
    await db.exec(`UPDATE sessions SET start_time='${oldStart}'; UPDATE sessions SET recurring_session_id=NULL WHERE id='${lesson}';`);
    await db.exec('SET ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [tutor]);
    await db.query('UPDATE sessions SET start_time=$1 WHERE id=$2', [newStart, lesson]);
  });
});
