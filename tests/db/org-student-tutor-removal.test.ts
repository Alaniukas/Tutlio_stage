// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION private.has_active_auth_session() RETURNS boolean LANGUAGE sql AS $$
      SELECT COALESCE(NULLIF(current_setting('test.active_session',true),''),'true')::boolean $$;
    CREATE FUNCTION public.write_blocked_by_org_suspension() RETURNS boolean LANGUAGE sql AS $$
      SELECT COALESCE(NULLIF(current_setting('test.write_blocked',true),''),'false')::boolean $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE organization_admins(user_id uuid,organization_id uuid,status text,
      accepted_at timestamptz,role text,permissions jsonb);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,tutor_id uuid,
      full_name text,email text,linked_user_id uuid,parent_user_id uuid,
      detached_at timestamptz,enrollment_status text DEFAULT 'active');
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE parent_students(parent_id uuid,student_id uuid,
      PRIMARY KEY(parent_id,student_id));
    CREATE TABLE recurring_individual_sessions(id uuid PRIMARY KEY,student_id uuid,
      tutor_id uuid,active boolean DEFAULT true);
    CREATE TABLE sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,
      status text DEFAULT 'active',start_time timestamptz,recurring_session_id uuid,
      class_group_id uuid,paid boolean DEFAULT false,lesson_package_id uuid,
      cancelled_at timestamptz,cancelled_by text,hidden_from_calendar boolean DEFAULT false,
      cancellation_penalty_amount numeric,penalty_resolution text,is_late_cancelled boolean DEFAULT false);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,
      paid boolean,available_lessons numeric,reserved_lessons numeric,cancelled_at timestamptz);
    CREATE TABLE subjects(id uuid PRIMARY KEY,tutor_id uuid);
    CREATE TABLE lesson_package_items(package_id uuid,subject_id uuid,available_lessons integer,reserved_lessons integer);
    CREATE TABLE invoices(id uuid PRIMARY KEY,source_session_id uuid);
    CREATE TABLE invoice_line_items(invoice_id uuid,session_ids uuid[]);
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE recurring_individual_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  await db.exec(readFileSync('supabase/migrations/20261015083453_preserve_tutor_pairing_parent_links.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261022073353_atomic_org_student_tutor_removal.sql', 'utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    SELECT set_config('test.active_session','true',false),set_config('test.write_blocked','false',false);
    DROP TRIGGER IF EXISTS fail_recurrence ON recurring_individual_sessions;
    DROP TRIGGER IF EXISTS fail_detach ON students;
    TRUNCATE invoice_line_items,invoices,lesson_package_items,subjects,lesson_packages,sessions,recurring_individual_sessions,
      parent_students,parent_profiles,students,organization_admins,organizations;
    INSERT INTO organizations VALUES ('${id(1)}'),('${id(2)}');
    INSERT INTO organization_admins VALUES
      ('${id(51)}','${id(1)}','active',now(),'admin','{"students.edit":true,"sessions.edit":true}'),
      ('${id(52)}','${id(1)}','active',now(),'admin','{"students.edit":true}'),
      ('${id(53)}','${id(1)}','active',now(),'admin','{"sessions.edit":true}'),
      ('${id(54)}','${id(1)}','revoked',now(),'owner','{}'),
      ('${id(55)}','${id(1)}','active',now(),'owner','{}'),
      ('${id(56)}','${id(1)}','active',null,'owner','{}'),
      ('${id(57)}','${id(2)}','active',now(),'owner','{}');
    INSERT INTO students(id,organization_id,tutor_id,full_name,email,linked_user_id,parent_user_id) VALUES
      ('${id(11)}','${id(1)}','${id(21)}','Denas','child@example.test','${id(31)}','${id(32)}'),
      ('${id(12)}','${id(1)}','${id(22)}','Denas','child@example.test','${id(31)}',null),
      ('${id(13)}','${id(1)}','${id(23)}','Denas','child@example.test','${id(31)}',null),
      ('${id(14)}','${id(1)}',null,'Denas','child@example.test','${id(31)}',null),
      ('${id(15)}','${id(2)}','${id(24)}','Denas','child@example.test','${id(31)}',null),
      ('${id(16)}','${id(1)}','${id(22)}','Gabija','child@example.test','${id(31)}',null),
      ('${id(17)}','${id(1)}','${id(23)}','Denas','different@example.test','${id(33)}',null);
    INSERT INTO parent_profiles VALUES ('${id(41)}','${id(32)}'),('${id(42)}','${id(34)}');
    INSERT INTO parent_students VALUES ('${id(41)}','${id(11)}');
    INSERT INTO recurring_individual_sessions VALUES
      ('${id(201)}','${id(11)}','${id(21)}',true),
      ('${id(202)}','${id(12)}','${id(22)}',true),
      ('${id(203)}','${id(11)}','${id(21)}',false);
    INSERT INTO sessions(id,student_id,tutor_id,status,start_time,recurring_session_id,class_group_id) VALUES
      ('${id(101)}','${id(11)}','${id(21)}','active',now()+interval '1 day','${id(201)}',null),
      ('${id(102)}','${id(11)}','${id(21)}','completed',now()-interval '7 days','${id(201)}',null),
      ('${id(103)}','${id(11)}','${id(21)}','active',now()-interval '1 day','${id(201)}',null),
      ('${id(104)}','${id(11)}','${id(21)}','completed',now()+interval '1 day','${id(201)}',null),
      ('${id(105)}','${id(12)}','${id(22)}','active',now()+interval '1 day','${id(202)}',null),
      ('${id(106)}','${id(11)}','${id(21)}','active',now()+interval '1 day',null,'${id(401)}');
    INSERT INTO lesson_packages VALUES ('${id(301)}','${id(11)}','${id(21)}',true,5,0,null);
  `);
});

async function remove(options: { user?: string; role?: string; remaining?: string[]; tutor?: string; student?: string } = {}) {
  await db.exec(`SET ROLE ${options.role || 'authenticated'}`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [options.user ?? id(51)]);
    return (await db.query<{ result: { mode: string; cancelledSessions: number } }>(
      'SELECT public.remove_org_student_tutor_pairing($1,$2,$3) AS result',
      [options.student ?? id(11), options.tutor ?? id(21), options.remaining ?? [id(12)]],
    )).rows[0].result;
  } finally { await db.exec('RESET ROLE'); }
}

async function snapshot() {
  const tables = ['students', 'parent_students', 'sessions', 'recurring_individual_sessions', 'lesson_packages'];
  return Promise.all(tables.map(async (table) => (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows));
}

describe('atomic organization tutor removal', () => {
  it('stops future individual lessons without transferring them to the only remaining tutor', async () => {
    const otherBefore = (await db.query('SELECT * FROM sessions WHERE id=$1', [id(105)])).rows;
    expect(await remove()).toEqual({ mode: 'detached', cancelledSessions: 1 });
    expect((await db.query('SELECT tutor_id FROM students WHERE id=$1', [id(11)])).rows[0].tutor_id).toBeNull();
    expect((await db.query('SELECT tutor_id,student_id,status,hidden_from_calendar,cancellation_penalty_amount FROM sessions WHERE id=$1', [id(101)])).rows[0])
      .toEqual({ tutor_id: id(21), student_id: id(11), status: 'cancelled', hidden_from_calendar: true, cancellation_penalty_amount: '0' });
    expect((await db.query('SELECT active FROM recurring_individual_sessions WHERE id=$1', [id(201)])).rows[0].active).toBe(false);
    expect((await db.query('SELECT * FROM sessions WHERE id=$1', [id(105)])).rows).toEqual(otherBefore);
    expect((await db.query('SELECT available_lessons,paid FROM lesson_packages WHERE id=$1', [id(301)])).rows[0])
      .toEqual({ available_lessons: '5', paid: true });
  });

  it('preserves completed lessons, past unconfirmed lessons and school class membership lessons', async () => {
    const before = (await db.query('SELECT * FROM sessions WHERE id=ANY($1) ORDER BY id', [[id(102), id(103), id(104), id(106)]])).rows;
    await remove();
    expect((await db.query('SELECT * FROM sessions WHERE id=ANY($1) ORDER BY id', [[id(102), id(103), id(104), id(106)]])).rows).toEqual(before);
  });

  it('retains both guardians on every remaining card, including an unassigned card', async () => {
    await db.query('INSERT INTO parent_students VALUES ($1,$2)', [id(42), id(11)]);
    await remove({ remaining: [id(12), id(13), id(14)] });
    const rows = (await db.query('SELECT student_id,count(*)::integer AS guardians FROM parent_students WHERE student_id=ANY($1) GROUP BY student_id ORDER BY student_id', [[id(11), id(12), id(13), id(14)]])).rows;
    expect(rows).toEqual([11, 12, 13, 14].map((n) => ({ student_id: id(n), guardians: 2 })));
  });

  it('keeps the last child card and its family and billing history', async () => {
    await remove({ remaining: [] });
    expect((await db.query('SELECT count(*)::integer AS count FROM students WHERE id=$1', [id(11)])).rows[0].count).toBe(1);
    expect((await db.query('SELECT count(*)::integer AS count FROM parent_students WHERE student_id=$1', [id(11)])).rows[0].count).toBe(1);
  });

  it.each(['recurrence', 'detach'])('rolls back lessons, templates and parent copies if the later %s write fails', async (step) => {
    await db.exec(`CREATE OR REPLACE FUNCTION test_removal_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Simulated late write failure'; END $$;`);
    await db.exec(step === 'recurrence'
      ? 'CREATE TRIGGER fail_recurrence BEFORE UPDATE ON recurring_individual_sessions FOR EACH ROW EXECUTE FUNCTION test_removal_failure()'
      : `CREATE TRIGGER fail_detach BEFORE UPDATE ON students FOR EACH ROW WHEN (NEW.id='${id(11)}' AND NEW.tutor_id IS NULL) EXECUTE FUNCTION test_removal_failure()`);
    const before = await snapshot();
    await expect(remove()).rejects.toThrow('Simulated late write failure');
    expect(await snapshot()).toEqual(before);
  });

  it.each(['paid', 'package', 'line item', 'source invoice'])('requires normal billing cancellation for a future lesson linked to %s', async (kind) => {
    if (kind === 'paid') await db.query('UPDATE sessions SET paid=true WHERE id=$1', [id(101)]);
    if (kind === 'package') await db.query('UPDATE sessions SET lesson_package_id=$1 WHERE id=$2', [id(301), id(101)]);
    if (kind === 'line item') await db.query('INSERT INTO invoice_line_items VALUES ($1,$2)', [id(501), [id(101)]]);
    if (kind === 'source invoice') await db.query('INSERT INTO invoices VALUES ($1,$2)', [id(501), id(101)]);
    const before = await snapshot();
    await expect(remove()).rejects.toThrow('tutor_pairing_billing_review_required');
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a previously interrupted transfer before changing either tutor card', async () => {
    await db.query('UPDATE sessions SET tutor_id=$1,student_id=$2 WHERE id=$3', [id(22), id(12), id(101)]);
    const before = await snapshot();
    await expect(remove()).rejects.toThrow('tutor_pairing_changed');
    expect(await snapshot()).toEqual(before);
  });

  it.each(['own', 'mixed'])('requires pending %s package offers to be corrected before stopping a tutor', async (kind) => {
    await db.query('INSERT INTO lesson_packages VALUES ($1,$2,$3,false,3,0,null)',
      [id(302), kind === 'own' ? id(11) : id(12), kind === 'own' ? id(21) : id(22)]);
    if (kind === 'mixed') {
      await db.query('INSERT INTO subjects VALUES ($1,$2)', [id(601), id(21)]);
      await db.query('INSERT INTO lesson_package_items VALUES ($1,$2,2,0)', [id(302), id(601)]);
    }
    const before = await snapshot();
    await expect(remove()).rejects.toThrow('tutor_pairing_billing_review_required');
    expect(await snapshot()).toEqual(before);
  });

  it('keeps an unrelated pending package for the other tutor', async () => {
    await db.query('INSERT INTO lesson_packages VALUES ($1,$2,$3,false,3,0,null)', [id(302), id(12), id(22)]);
    await expect(remove()).resolves.toMatchObject({ mode: 'detached' });
    expect((await db.query('SELECT cancelled_at,available_lessons FROM lesson_packages WHERE id=$1', [id(302)])).rows[0])
      .toEqual({ cancelled_at: null, available_lessons: '3' });
  });

  it('prevents a stale materializer from adding future lessons to a stopped recurrence', async () => {
    await remove();
    const result = await db.query('INSERT INTO sessions(id,student_id,tutor_id,start_time,recurring_session_id) VALUES ($1,$2,$3,now()+interval \'2 days\',$4) RETURNING id', [id(107), id(11), id(21), id(201)]);
    expect(result.rows).toEqual([]);
    const past = await db.query('INSERT INTO sessions(id,student_id,tutor_id,start_time,recurring_session_id) VALUES ($1,$2,$3,now()-interval \'2 days\',$4) RETURNING id', [id(108), id(11), id(21), id(201)]);
    expect(past.rows).toHaveLength(1);
  });
});

describe('tutor removal authorization', () => {
  it.each([52, 53, 54, 56, 57, 21])('rejects incomplete, revoked, unaccepted and foreign memberships (%s)', async (user) => {
    const before = await snapshot();
    await expect(remove({ user: id(user) })).rejects.toThrow('Insufficient organization permission');
    expect(await snapshot()).toEqual(before);
  });

  it('allows an accepted owner without per-seat permission flags', async () => {
    await expect(remove({ user: id(55) })).resolves.toMatchObject({ mode: 'detached' });
  });

  it('does not authorize a null membership role without the required permissions', async () => {
    await db.query('UPDATE organization_admins SET role=null,permissions=null WHERE user_id=$1', [id(51)]);
    await expect(remove()).rejects.toThrow('Insufficient organization permission');
  });

  it.each(['anon', 'service_role'])('does not expose the RPC to %s', async (role) => {
    await expect(remove({ role })).rejects.toThrow('permission denied');
  });

  it.each(['session', 'suspension'])('rejects a revoked login or a suspended organization (%s)', async (kind) => {
    await db.query("SELECT set_config($1,$2,false)", [kind === 'session' ? 'test.active_session' : 'test.write_blocked', kind === 'session' ? 'false' : 'true']);
    await expect(remove()).rejects.toThrow('Insufficient organization permission');
  });

  it.each([15, 16, 17])('rejects a foreign organization, sibling or different child account in remaining cards (%s)', async (student) => {
    const before = await snapshot();
    await expect(remove({ remaining: [id(12), id(student)] })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it('rejects stale tutor selection and conflicting parents', async () => {
    await expect(remove({ tutor: id(23) })).rejects.toThrow('tutor_pairing_changed');
    await db.query('UPDATE students SET parent_user_id=$1 WHERE id=$2', [id(34), id(12)]);
    await expect(remove()).rejects.toThrow('conflicting parent accounts');
    expect((await db.query('SELECT status FROM sessions WHERE id=$1', [id(101)])).rows[0].status).toBe('active');
  });
});
