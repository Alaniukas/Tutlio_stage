// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const uid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const org = 'c3a00000-7e57-4000-8000-000000000001', group = uid(1), teacher = uid(2), admin = uid(3), outsider = uid(4), childA = uid(5), childB = uid(6);
const original = '2026-10-01T11:00:00Z', next = '2026-10-03T11:00:00Z', nextAgain = '2026-10-04T11:00:00Z';

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TABLE school_class_groups(id uuid PRIMARY KEY,organization_id uuid);
    CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid);
    CREATE TABLE organization_admins(user_id uuid,organization_id uuid,role text,status text,accepted_at timestamptz,permissions jsonb);
    CREATE TABLE sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,class_group_id uuid,
      start_time timestamptz,end_time timestamptz,status text,meeting_link text,original_start_time timestamptz,rescheduled_at timestamptz,created_by_role text,
      status_confirmed_at timestamptz,student_joined_at timestamptz,tutor_joined_at timestamptz,
      reminder_student_sent boolean,reminder_payer_sent boolean,reminder_tutor_sent boolean,
      status_reminder_last_sent_at timestamptz,no_show_reason text,no_show_when text);
    GRANT SELECT,UPDATE ON sessions TO authenticated;
    INSERT INTO school_class_groups VALUES ('${group}','${org}');
    INSERT INTO profiles VALUES ('${teacher}','${org}'),('${outsider}','${uid(999)}');
    INSERT INTO organization_admins VALUES ('${admin}','${org}','admin','active',now(),'{}');
    INSERT INTO sessions(id,student_id,tutor_id,class_group_id,start_time,end_time,status,meeting_link,
      reminder_student_sent,reminder_payer_sent,reminder_tutor_sent)
    VALUES ('${uid(10)}','${childA}','${teacher}','${group}','${original}','2026-10-01T12:30:00Z','active','https://meet.google.com/same',true,true,true),
      ('${uid(11)}','${childB}','${teacher}','${group}','${original}','2026-10-01T12:30:00Z','no_show','https://meet.google.com/same',true,true,true);
  `);
  const permissions = readFileSync('supabase/migrations/20260903172018_org_admin_role_permission_presets_reapply.sql', 'utf8');
  const start = permissions.indexOf('CREATE OR REPLACE FUNCTION private.org_admin_role_grants_permission(');
  await db.exec(permissions.slice(start, permissions.indexOf('$$;', start) + 3));
  await db.exec(readFileSync('supabase/migrations/20261002113637_school_group_occurrence_rescheduling.sql', 'utf8'));
  return db;
}
async function asActor(db: PGlite, actor: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec('SET ROLE authenticated');
}

it('captures a whole past occurrence atomically, reopens only unconfirmed outcomes and keeps one exception through another move', async () => {
  const db = await database();
  try {
    await asActor(db, teacher);
    await db.query('UPDATE sessions SET start_time=$1,end_time=$1::timestamptz+interval \'90 minutes\'', [next]);
    const rows = (await db.query<any>('SELECT id,status,original_start_time,reminder_student_sent,reminder_payer_sent,reminder_tutor_sent,meeting_link FROM sessions ORDER BY id')).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.status === 'active' && !row.reminder_student_sent && !row.reminder_payer_sent && !row.reminder_tutor_sent)).toBe(true);
    expect(rows.map(row => new Date(row.original_start_time).toISOString())).toEqual(['2026-10-01T11:00:00.000Z','2026-10-01T11:00:00.000Z']);
    expect(rows.every(row => row.meeting_link === 'https://meet.google.com/same')).toBe(true);
    await db.exec('RESET ROLE');
    await asActor(db, admin); // Role preset grants sessions.edit without a stored JSON grant.
    await db.query('UPDATE sessions SET start_time=$1,end_time=$1::timestamptz+interval \'90 minutes\'', [nextAgain]);
    await db.exec('RESET ROLE');
    const overrides = (await db.query<any>('SELECT * FROM school_class_group_occurrence_overrides')).rows;
    expect(overrides).toHaveLength(1);
    expect(new Date(overrides[0].original_start_time).toISOString()).toBe('2026-10-01T11:00:00.000Z');
    expect(new Date(overrides[0].start_time).toISOString()).toBe('2026-10-04T11:00:00.000Z');
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    await expect(db.query(`INSERT INTO sessions(id,student_id,tutor_id,class_group_id,start_time,end_time,status,created_by_role)
      VALUES($1,$2,$3,$4,$5,$5::timestamptz+interval '90 minutes','active','system')`, [uid(12),childA,teacher,group,original]))
      .rejects.toThrow('occurrence_moved');
    // Another occurrence can move away from the first one's replacement date.
    // Materializing the first move is still valid at that newly freed time.
    await db.query(`INSERT INTO school_class_group_occurrence_overrides(group_id,original_start_time,start_time,end_time)
      VALUES($1,$2,'2026-10-05T11:00:00Z','2026-10-05T12:30:00Z')`, [group,nextAgain]);
    await db.query(`INSERT INTO sessions(id,student_id,tutor_id,class_group_id,start_time,end_time,status,created_by_role,original_start_time)
      VALUES($1,$2,$3,$4,$5,$5::timestamptz+interval '90 minutes','active','system',$6)`, [uid(12),childA,teacher,group,nextAgain,original]);
  } finally { await db.close(); }
}, 30_000);

it('rolls the entire group edit back if a confirmed attendance row is included', async () => {
  const db = await database();
  try {
    await db.query('UPDATE sessions SET status_confirmed_at=now() WHERE id=$1', [uid(11)]);
    await asActor(db, teacher);
    await expect(db.query('UPDATE sessions SET start_time=$1,end_time=$1::timestamptz+interval \'90 minutes\'', [next])).rejects.toThrow('already_confirmed');
    await db.exec('RESET ROLE');
    expect((await db.query('SELECT count(*)::integer AS count FROM school_class_group_occurrence_overrides')).rows[0]).toEqual({ count: 0 });
    expect((await db.query<any>('SELECT start_time FROM sessions')).rows.every(row => new Date(row.start_time).toISOString() === '2026-10-01T11:00:00.000Z')).toBe(true);
  } finally { await db.close(); }
}, 30_000);

it('denies outsiders, hides the exception table from clients and ignores automatic reconciliation', async () => {
  const db = await database();
  try {
    await asActor(db, outsider);
    await expect(db.query('UPDATE sessions SET start_time=$1,end_time=$1::timestamptz+interval \'90 minutes\'', [next])).rejects.toThrow('forbidden');
    await expect(db.query('SELECT * FROM school_class_group_occurrence_overrides')).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE');
    const acl = (await db.query(`SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anonymous,
      has_table_privilege('authenticated',oid,'INSERT') AS user_write,has_table_privilege('service_role',oid,'SELECT') AS service_read
      FROM pg_class WHERE oid='public.school_class_group_occurrence_overrides'::regclass`)).rows[0];
    expect(acl).toEqual({ rls: true, anonymous: false, user_write: false, service_read: true });
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    await db.query('UPDATE sessions SET end_time=end_time+interval \'15 minutes\'');
    expect((await db.query('SELECT count(*)::integer AS count FROM school_class_group_occurrence_overrides')).rows[0]).toEqual({ count: 0 });
  } finally { await db.close(); }
}, 30_000);
