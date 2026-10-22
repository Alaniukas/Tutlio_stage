// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const org = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
const source = 'beabb176-4c62-4f64-85e7-f3d98e13a6e3';
const math = 'd0ff2bbf-a400-4016-abb4-1610ac285fdb';
const oldTutor = '0bf3cd22-151b-4d1a-95c6-1e1568c5c597';
const mathTutor = '933cf588-d10a-46b8-9829-e67e404e9c53';
const series = '932867e4-0c7b-49e1-a9eb-13c74f0b7401';
const mathSeries = '3e1af963-ca33-430d-be12-27dc9ff573e2';
const offer = '919deebb-b557-4134-80b7-ef72af1446cf';
const paidTrial = 'd0e4edca-424a-4dd4-bb87-632f0ea9ea14';
const mathSubject = 'a1e086b2-321d-4e4c-84ac-34a2742de9f1';
const ltSubject = 'ab71a8ea-bc66-4b41-98ee-33838713e621';
const trialSubject = 'e6365725-4afb-4209-9903-e00631afa193';
const pooledMigration = readFileSync('supabase/migrations/20260910174000_org_student_pooled_packages.sql', 'utf8');
const repairSql = readFileSync('scripts/sql/repair-proklase-amanda-tutor-removal-20261022.sql', 'utf8')
  // The operational script refuses elapsed lessons. Keep this dated fixture
  // reproducible after October 2026 without weakening that production guard.
  .replaceAll('now()', "TIMESTAMPTZ '2026-10-22 10:00:00+03'");
let db: PGlite;

function extractFunction(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const body = sql.indexOf('$$', start);
  const end = sql.indexOf('$$;', body + 2);
  if (start < 0 || body < 0 || end < 0) throw new Error(`Missing actual migration function ${name}`);
  return sql.slice(start, end + 3);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,tutor_id uuid,full_name text,
      email text,linked_user_id uuid,detached_at timestamptz);
    CREATE TABLE subjects(id uuid PRIMARY KEY,tutor_id uuid,is_trial boolean DEFAULT false);
    CREATE TABLE recurring_individual_sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,
      subject_id uuid,active boolean DEFAULT true);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,tutor_id uuid,
      subject_id uuid,total_lessons integer,available_lessons numeric,reserved_lessons numeric DEFAULT 0,
      completed_lessons numeric DEFAULT 0,price_per_lesson numeric,total_price numeric,
      paid boolean DEFAULT false,payment_status text DEFAULT 'pending',active boolean DEFAULT true,
      payment_method text,billing_period_start date,billing_period_end date,expires_at timestamptz,
      pool_organization_id uuid,pool_identity_key text,cancelled_at timestamptz,cancelled_by uuid,
      stripe_checkout_session_id text,manual_sales_invoice_id uuid);
    CREATE UNIQUE INDEX pool_month_unique ON lesson_packages(pool_organization_id,pool_identity_key,billing_period_end)
      WHERE pool_organization_id IS NOT NULL AND payment_status <> 'cancelled';
    CREATE TABLE pooled_package_quotes(package_id uuid PRIMARY KEY,preview_token text,session_ids uuid[]);
    CREATE TABLE lesson_package_items(id uuid DEFAULT gen_random_uuid(),package_id uuid,subject_id uuid,
      total_lessons integer,available_lessons integer,reserved_lessons integer DEFAULT 0,
      completed_lessons integer DEFAULT 0,price_per_lesson numeric,total_price numeric,position integer);
    CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,tutor_id uuid,subject_id uuid,
      status text DEFAULT 'active',start_time timestamptz,recurring_session_id uuid,paid boolean DEFAULT false,
      lesson_package_id uuid,class_group_id uuid,status_confirmed_at timestamptz,is_complimentary boolean DEFAULT false,
      is_makeup boolean DEFAULT false,is_late_cancelled boolean DEFAULT false,payment_status text DEFAULT 'pending',
      reservation_expires_at timestamptz,cancelled_at timestamptz,cancelled_by text,hidden_from_calendar boolean DEFAULT false,
      cancellation_penalty_amount numeric,penalty_resolution text);
    CREATE TABLE invoice_line_items(invoice_id uuid,session_ids uuid[]);
    CREATE TABLE invoices(id uuid PRIMARY KEY,source_session_id uuid);
  `);
  for (const name of ['package_student_identity', 'create_org_student_package', 'protect_pooled_package', 'allocate_pooled_session', 'recount_pooled_session']) {
    await db.exec(extractFunction(pooledMigration, name));
  }
  await db.exec(extractFunction(readFileSync('supabase/migrations/20260916170000_atomic_package_cancellation.sql', 'utf8'), 'cancel_pending_lesson_package'));
  await db.exec(`
    CREATE TRIGGER protect_pooled_package BEFORE INSERT OR UPDATE ON lesson_packages FOR EACH ROW EXECUTE FUNCTION protect_pooled_package();
    CREATE TRIGGER allocate_pooled_session BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION allocate_pooled_session();
    CREATE TRIGGER recount_pooled_session AFTER INSERT OR UPDATE OR DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION recount_pooled_session();
  `);
}, 30_000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`
    DROP TRIGGER IF EXISTS fail_replacement ON lesson_packages;
    TRUNCATE invoice_line_items,invoices,pooled_package_quotes,lesson_package_items,sessions,
      lesson_packages,recurring_individual_sessions,subjects,students,profiles;
    SELECT set_config('request.jwt.claim.role','service_role',false);
    INSERT INTO profiles VALUES ('${oldTutor}','${org}'),('${mathTutor}','${org}');
    INSERT INTO students VALUES
      ('${source}','${org}','${oldTutor}','Amanda','synthetic@example.test','11111111-1111-4111-8111-111111111111',null),
      ('${math}','${org}','${mathTutor}','Amanda','synthetic@example.test','11111111-1111-4111-8111-111111111111',null);
    INSERT INTO subjects VALUES ('${mathSubject}','${mathTutor}',false),('${ltSubject}','${oldTutor}',false),('${trialSubject}','${mathTutor}',true);
    INSERT INTO recurring_individual_sessions VALUES ('${series}','${source}','${oldTutor}','${ltSubject}',true),
      ('${mathSeries}','${math}','${mathTutor}','${mathSubject}',true);
    INSERT INTO sessions(student_id,tutor_id,subject_id,start_time,recurring_session_id)
      SELECT '${math}','${mathTutor}','${ltSubject}',(date::date+time '18:30') AT TIME ZONE 'Europe/Vilnius','${series}'
      FROM generate_series(date '2026-10-22',date '2027-06-10',interval '7 days') date;
    INSERT INTO sessions(student_id,tutor_id,subject_id,start_time,recurring_session_id)
      SELECT '${math}','${mathTutor}','${mathSubject}',(date::date+time '19:00') AT TIME ZONE 'Europe/Vilnius','${mathSeries}'
      FROM generate_series(date '2026-10-26',date '2027-06-14',interval '7 days') date;
    INSERT INTO sessions(student_id,tutor_id,subject_id,start_time,recurring_session_id,status,paid)
      VALUES ('${math}','${mathTutor}','${trialSubject}','2026-10-19 19:00+03','${mathSeries}','completed',true);
    INSERT INTO lesson_packages(id,student_id,tutor_id,total_lessons,available_lessons,price_per_lesson,total_price,
      pool_organization_id,pool_identity_key,billing_period_start,billing_period_end)
      SELECT '${offer}','${math}','${mathTutor}',3,3,29,87,'${org}',package_student_identity(s),'2026-10-01','2026-10-31'
      FROM students s WHERE id='${math}';
    INSERT INTO lesson_package_items(package_id,subject_id,total_lessons,available_lessons,price_per_lesson,total_price,position)
      VALUES ('${offer}','${mathSubject}',1,1,29,29,0),('${offer}','${ltSubject}',2,2,29,58,1);
    INSERT INTO lesson_packages(id,student_id,tutor_id,subject_id,total_lessons,available_lessons,paid,payment_status,price_per_lesson,total_price)
      VALUES ('${paidTrial}','${math}','${mathTutor}','${trialSubject}',1,0,true,'paid',10,10);
  `);
});

async function snapshot() {
  return Promise.all(['students', 'sessions', 'recurring_individual_sessions', 'lesson_packages', 'lesson_package_items', 'pooled_package_quotes']
    .map(async (table) => (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows));
}
async function applyRepair() {
  try { await db.exec(repairSql); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}

describe('guarded Amanda repair with actual package functions', () => {
  it('stops the 34 Lithuanian lessons, keeps all 35 maths lessons and replaces only the unpaid mixed offer', async () => {
    const mathsBefore = (await db.query('SELECT * FROM sessions WHERE recurring_session_id=$1 ORDER BY id', [mathSeries])).rows;
    const trialBefore = (await db.query('SELECT * FROM lesson_packages WHERE id=$1', [paidTrial])).rows;
    await applyRepair();
    expect((await db.query('SELECT * FROM sessions WHERE recurring_session_id=$1 ORDER BY id', [mathSeries])).rows).toEqual(mathsBefore);
    expect((await db.query('SELECT * FROM lesson_packages WHERE id=$1', [paidTrial])).rows).toEqual(trialBefore);
    expect((await db.query('SELECT status,tutor_id,student_id,hidden_from_calendar FROM sessions WHERE recurring_session_id=$1', [series])).rows)
      .toEqual(Array.from({ length: 34 }, () => ({ status: 'cancelled', tutor_id: oldTutor, student_id: source, hidden_from_calendar: true })));
    expect((await db.query('SELECT active FROM recurring_individual_sessions WHERE id=$1', [series])).rows[0].active).toBe(false);
    expect((await db.query('SELECT tutor_id FROM students WHERE id=$1', [source])).rows[0].tutor_id).toBeNull();
    expect((await db.query('SELECT payment_status,total_price FROM lesson_packages WHERE id=$1', [offer])).rows[0])
      .toEqual({ payment_status: 'cancelled', total_price: '87' });
    const replacement = (await db.query('SELECT id,total_lessons,total_price FROM lesson_packages WHERE pool_organization_id=$1 AND payment_status=$2', [org, 'pending'])).rows[0];
    expect(replacement).toMatchObject({ total_lessons: 1, total_price: '29' });
    expect((await db.query('SELECT subject_id,total_lessons FROM lesson_package_items WHERE package_id=$1', [replacement.id])).rows)
      .toEqual([{ subject_id: mathSubject, total_lessons: 1 }]);
    expect((await db.query('SELECT cardinality(session_ids) AS count FROM pooled_package_quotes WHERE package_id=$1', [replacement.id])).rows[0].count).toBe(1);
  });

  it('does not create a second replacement or touch history when rerun', async () => {
    await applyRepair();
    const before = await snapshot();
    await applyRepair();
    expect(await snapshot()).toEqual(before);
  });

  it.each(['paid offer', 'checkout', 'paid lesson', 'completed lesson', 'invoice', 'different child'])('refuses drift in %s and preserves all records', async (kind) => {
    if (kind === 'paid offer') await db.query('UPDATE lesson_packages SET paid=true,payment_status=$1 WHERE id=$2', ['paid', offer]);
    if (kind === 'checkout') await db.query('UPDATE lesson_packages SET stripe_checkout_session_id=$1 WHERE id=$2', ['cs_live_do_not_modify', offer]);
    if (kind === 'paid lesson') await db.query('UPDATE sessions SET paid=true WHERE id=(SELECT id FROM sessions WHERE recurring_session_id=$1 LIMIT 1)', [series]);
    if (kind === 'completed lesson') await db.query('UPDATE sessions SET status=$1 WHERE id=(SELECT id FROM sessions WHERE recurring_session_id=$2 LIMIT 1)', ['completed', series]);
    if (kind === 'invoice') await db.query('INSERT INTO invoice_line_items SELECT gen_random_uuid(),ARRAY[id] FROM sessions WHERE recurring_session_id=$1 LIMIT 1', [series]);
    if (kind === 'different child') await db.query('UPDATE students SET linked_user_id=gen_random_uuid() WHERE id=$1', [source]);
    const before = await snapshot();
    await expect(applyRepair()).rejects.toThrow('review');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back the old offer, cancellations and tutor removal if the replacement cannot be created', async () => {
    await db.exec(`CREATE FUNCTION fail_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Replacement creation failed'; END $$;
      CREATE TRIGGER fail_replacement BEFORE INSERT ON lesson_packages FOR EACH ROW EXECUTE FUNCTION fail_replacement();`);
    const before = await snapshot();
    await expect(applyRepair()).rejects.toThrow('Replacement creation failed');
    expect(await snapshot()).toEqual(before);
  });
});
