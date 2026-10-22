// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261022144501_proklase_reprice_existing_unpaid_lessons.sql', 'utf8');
const previous = readFileSync('supabase/migrations/20261007153000_pricing_frequency_students_edit_identity.sql', 'utf8');
const identity = readFileSync('supabase/migrations/20260908173000_org_identity_pricing_frequency.sql', 'utf8');
const sessionGuard = readFileSync('supabase/migrations/20261016151444_enforce_active_auth_sessions.sql', 'utf8');
const permissions = readFileSync('supabase/migrations/20260814105327_org_admin_seats_permissions.sql', 'utf8');
const pk = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
const qa = 'b0a00000-7e57-4000-8000-000000000001';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

function sqlFunction(source: string, name: string, delimiter = '$$') {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  const end = source.indexOf(`\n${delimiter};`, start);
  if (start < 0 || end < 0) throw new Error(`Missing SQL function ${name}`);
  return source.slice(start, end + delimiter.length + 2);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid, not_after timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE organization_admins(user_id uuid, organization_id uuid, status text DEFAULT 'active',
      accepted_at timestamptz DEFAULT now(), role text DEFAULT 'admin', permissions jsonb DEFAULT '{}');
    CREATE TABLE students(id uuid PRIMARY KEY, tutor_id uuid, organization_id uuid, full_name text,
      email text, payer_email text, linked_user_id uuid, detached_at timestamptz, grade text DEFAULT '8',
      pricing_lessons_per_week smallint DEFAULT 1, pricing_lessons_per_week_is_manual boolean DEFAULT true);
    CREATE TABLE recurring_individual_sessions(id uuid PRIMARY KEY, student_id uuid, active boolean, end_date date);
    CREATE TABLE organization_dynamic_pricing(organization_id uuid, lessons_per_week smallint,
      grade_min smallint, grade_max smallint, price numeric);
    CREATE TABLE subjects(id uuid PRIMARY KEY, is_trial boolean DEFAULT false, is_group boolean DEFAULT false);
    CREATE TABLE student_individual_pricing(student_id uuid, subject_id uuid, price numeric);
    CREATE TABLE sessions(id uuid PRIMARY KEY, student_id uuid, tutor_id uuid, subject_id uuid,
      start_time timestamptz DEFAULT now() - interval '2 days', status text DEFAULT 'completed',
      paid boolean DEFAULT false, payment_status text DEFAULT 'pending', price numeric DEFAULT 29,
      is_complimentary boolean DEFAULT false, lesson_package_id uuid, class_group_id uuid,
      payment_batch_id uuid, stripe_checkout_session_id text, perlas_transaction_id text);
    CREATE TABLE invoices(id uuid PRIMARY KEY, source_session_id uuid, status text, pdf_meta jsonb DEFAULT '{}');
    CREATE TABLE invoice_line_items(invoice_id uuid, session_ids uuid[]);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY, cancelled_at timestamptz, payment_status text DEFAULT 'pending');
    CREATE TABLE pooled_package_quotes(package_id uuid PRIMARY KEY, session_ids uuid[]);
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public, auth, private TO authenticated, anon, service_role;
    GRANT SELECT ON students, sessions TO authenticated;
  `);
  // Execute the real identity, membership and live-session helpers.
  await db.exec(sqlFunction(previous, 'private.pricing_identity_student_ids'));
  await db.exec(sqlFunction(identity, 'private.pricing_identity_frequency'));
  await db.exec(sqlFunction(identity, 'private.pricing_identity_effective_frequency'));
  await db.exec(sqlFunction(permissions, 'private.org_admin_user_has_permission'));
  await db.exec(sqlFunction(sessionGuard, 'private.has_active_auth_session', '$function$'));
  await db.exec(sqlFunction(sessionGuard, 'public.enforce_active_auth_session', '$function$'));
  await db.exec(`GRANT EXECUTE ON FUNCTION public.enforce_active_auth_session() TO authenticated;
    REVOKE ALL ON FUNCTION private.has_active_auth_session() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION private.has_active_auth_session() TO authenticated;`);
  await db.exec(previous);
  await db.exec(migration);
}, 30_000);

beforeEach(async () => {
  await db.exec(migration);
  await db.exec(`
    TRUNCATE profiles, organization_admins, students, recurring_individual_sessions,
      organization_dynamic_pricing, subjects, student_individual_pricing, sessions,
      invoices, invoice_line_items, lesson_packages, pooled_package_quotes, auth.sessions;
    INSERT INTO profiles VALUES ('${id(11)}','${pk}'), ('${id(12)}','${pk}'),
      ('${id(13)}','${qa}'), ('${id(14)}','${id(1)}');
    INSERT INTO organization_admins(user_id, organization_id, role, permissions) VALUES
      ('${id(21)}','${pk}','owner','{}'),
      ('${id(22)}','${pk}','admin','{"students.edit":true}'),
      ('${id(23)}','${pk}','admin','{"students.view":true}'),
      ('${id(25)}','${pk}','admin','{"finance.edit":true}'),
      ('${id(26)}','${pk}','admin','{"sessions.edit":true}'),
      ('${id(28)}','${id(1)}','owner','{}'), ('${id(29)}','${qa}','owner','{}');
    INSERT INTO organization_admins(user_id, organization_id, status, role) VALUES
      ('${id(24)}','${pk}','revoked','owner'), ('${id(24)}','${id(1)}','active','owner');
    INSERT INTO organization_admins(user_id, organization_id, accepted_at, role) VALUES
      ('${id(27)}','${pk}',NULL,'owner');
    INSERT INTO students(id, tutor_id, organization_id, full_name, email, payer_email, linked_user_id) VALUES
      ('${id(101)}','${id(11)}','${pk}','Child One','one@example.test','family@example.test','${id(801)}'),
      ('${id(102)}','${id(12)}','${pk}','Child One','one@example.test','family@example.test','${id(801)}'),
      ('${id(103)}','${id(11)}','${pk}','Child Two','two@example.test','family@example.test','${id(802)}'),
      ('${id(104)}','${id(14)}','${id(1)}','Child One','one@example.test','family@example.test','${id(801)}'),
      ('${id(105)}','${id(12)}','${pk}','Child One','one@example.test','family@example.test','${id(801)}'),
      ('${id(106)}','${id(13)}','${qa}','QA Child','qa@example.test','qa@example.test','${id(803)}');
    UPDATE students SET detached_at = now() WHERE id = '${id(105)}';
    INSERT INTO organization_dynamic_pricing
      SELECT org, frequency::smallint, 1, 12, price
      FROM unnest(ARRAY['${pk}'::uuid,'${qa}'::uuid,'${id(1)}'::uuid]) org
      CROSS JOIN (VALUES(1,29),(2,25),(3,22)) tier(frequency,price);
    INSERT INTO subjects(id, is_trial, is_group) VALUES
      ('${id(1001)}',false,false), ('${id(1002)}',true,false),
      ('${id(1003)}',false,true), ('${id(1004)}',false,false);
    INSERT INTO student_individual_pricing VALUES('${id(101)}','${id(1004)}',19);
    INSERT INTO recurring_individual_sessions VALUES
      ('${id(901)}','${id(101)}',true,NULL), ('${id(902)}','${id(102)}',true,NULL);
    INSERT INTO sessions(id, student_id, tutor_id, subject_id) VALUES
      ('${id(201)}','${id(101)}','${id(11)}','${id(1001)}'),
      ('${id(202)}','${id(102)}','${id(12)}','${id(1001)}'),
      ('${id(203)}','${id(101)}','${id(11)}','${id(1001)}'),
      ('${id(204)}','${id(103)}','${id(11)}','${id(1001)}'),
      ('${id(205)}','${id(105)}','${id(12)}','${id(1001)}'),
      ('${id(206)}','${id(104)}','${id(14)}','${id(1001)}'),
      ('${id(207)}','${id(104)}','${id(14)}','${id(1001)}'),
      ('${id(208)}','${id(106)}','${id(13)}','${id(1001)}');
    UPDATE sessions SET status = 'no_show' WHERE id = '${id(202)}';
    UPDATE sessions SET start_time = now() + interval '2 days', status = 'active'
      WHERE id IN ('${id(203)}','${id(207)}');
  `);
});

afterAll(async () => { await db?.close(); });

async function callFrequency(user = id(22), student = id(101), frequency: number | null = 3, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
      [user, JSON.stringify({ session_id: id(700) })]);
    return (await db.query<{ frequency: number | null }>(
      'SELECT public.set_student_pricing_frequency($1::uuid, $2::smallint) AS frequency', [student, frequency])).rows[0].frequency;
  } finally { await db.exec('RESET ROLE'); }
}

async function liveUser(user = id(22)) {
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id',
    [id(700), user]);
}

async function price(n = 201) {
  return Number((await db.query<{ price: string }>('SELECT price FROM sessions WHERE id=$1', [id(n)])).rows[0].price);
}

describe('Pro Klase existing unpaid lesson repricing', () => {
  it('reproduces the live future-only gap, then corrects past lessons through the authenticated RPC', async () => {
    await liveUser();
    await db.exec(sqlFunction(previous, 'public.set_student_pricing_frequency'));
    expect(await callFrequency()).toBe(3);
    expect(await price()).toBe(29);
    expect(await price(203)).toBe(22);
    await db.exec(migration);
    expect(await callFrequency()).toBe(3);
    expect(await price()).toBe(22);
    expect(await price(202)).toBe(22);
    expect(await price(203)).toBe(22);
    // Siblings, archived assignments, other organizations and QA stay separate.
    for (const n of [204,205,206,207,208]) expect(await price(n)).toBe(29);
    const rows = (await db.query<{ id: string; pricing_lessons_per_week: number }>(
      'SELECT id,pricing_lessons_per_week FROM students ORDER BY id')).rows;
    expect(rows.map(row => row.pricing_lessons_per_week)).toEqual([3,3,1,1,1,1]);
  });

  it.each([21,22,25,26])('allows the active owner or permitted administrator %s', async (user) => {
    await liveUser(id(user));
    expect(await callFrequency(id(user))).toBe(3);
    expect(await price()).toBe(22);
  });

  it.each([23,24,27,28,801,802])('rejects a read-only, revoked, pending, foreign, student or parent identity %s', async (user) => {
    await liveUser(id(user));
    await expect(callFrequency(id(user))).rejects.toThrow('Not allowed');
    expect(await price()).toBe(29);
  });

  it('rejects revoked sessions and anonymous callers', async () => {
    await expect(callFrequency()).rejects.toThrow('Not authenticated');
    await liveUser();
    await expect(callFrequency(id(22), id(101), 3, 'anon')).rejects.toThrow(/permission denied/);
    await db.exec("UPDATE auth.sessions SET not_after = now() - interval '1 second'");
    await expect(callFrequency()).rejects.toThrow('Not authenticated');
  });

  it('retains future-only tutor edits and rejects changes conflicting with the shared manual contract', async () => {
    await liveUser(id(11));
    await expect(callFrequency(id(11))).rejects.toThrow('Organization admin must change');
    await db.exec('UPDATE students SET pricing_lessons_per_week_is_manual=false');
    expect(await callFrequency(id(11))).toBe(3);
    expect(await price()).toBe(29);
    expect(await price(202)).toBe(29);
    expect(await price(203)).toBe(22);
  });

  it('keeps other organizations future-only and enables the same history correction in Pro Klase QA', async () => {
    await liveUser(id(28));
    await callFrequency(id(28), id(104));
    expect(await price(206)).toBe(29);
    expect(await price(207)).toBe(22);
    await liveUser(id(29));
    await callFrequency(id(29), id(106));
    expect(await price(208)).toBe(22);
  });

  it('recomputes automatic frequency across tutors and reprices prior unpaid lessons', async () => {
    await liveUser();
    expect(await callFrequency(id(22), id(101), null)).toBe(2);
    expect(await price()).toBe(25);
    expect(await price(202)).toBe(25);
  });

  it('also updates confirmed but unpaid monthly-billing lessons without packages', async () => {
    await db.exec(`UPDATE sessions SET payment_status='confirmed' WHERE id='${id(201)}'`);
    await liveUser();
    await callFrequency();
    expect(await price()).toBe(22);
  });

  it.each([
    ['paid flag', "paid=true"],
    ['paid status', "payment_status='paid'"],
    ['refund', "payment_status='refunded'"],
    ['cancelled lesson', "status='cancelled'"],
    ['complimentary lesson', 'is_complimentary=true'],
    ['trial', `subject_id='${id(1002)}'`],
    ['group subject', `subject_id='${id(1003)}'`],
    ['individual price', `subject_id='${id(1004)}'`],
    ['class group', `class_group_id='${id(999)}'`],
    ['package', `lesson_package_id='${id(999)}'`],
    ['payment batch', `payment_batch_id='${id(999)}'`],
    ['Stripe checkout', "stripe_checkout_session_id='cs_fixture'"],
    ['Perlas transaction', "perlas_transaction_id='perlas_fixture'"],
  ])('preserves %s prices, both past and future', async (_, patch) => {
    await db.exec(`UPDATE sessions SET ${patch} WHERE id IN ('${id(201)}','${id(203)}')`);
    await liveUser();
    await callFrequency();
    expect(await price()).toBe(29);
    expect(await price(203)).toBe(29);
    expect(await price(202)).toBe(22);
  });

  it.each(['source','line'])('preserves an existing unpaid customer invoice linked by %s', async (link) => {
    await db.exec(`INSERT INTO invoices VALUES('${id(501)}',${link === 'source' ? `'${id(201)}'` : 'NULL'},'issued','{"invoiceKind":"customer_sale"}');`);
    if (link === 'line') await db.exec(`INSERT INTO invoice_line_items VALUES('${id(501)}',ARRAY['${id(201)}'::uuid]);`);
    const before = (await db.query('SELECT to_jsonb(i) AS invoice FROM invoices i')).rows;
    await liveUser();
    await callFrequency();
    expect(await price()).toBe(29);
    expect((await db.query('SELECT to_jsonb(i) AS invoice FROM invoices i')).rows).toEqual(before);
  });

  it.each(['cancelled','tutor_pay'])('does not let a %s invoice block a client-price correction', async (kind) => {
    await db.exec(`INSERT INTO invoices VALUES('${id(501)}','${id(201)}',
      '${kind === 'cancelled' ? 'cancelled' : 'issued'}','{"invoiceKind":"${kind === 'tutor_pay' ? kind : 'customer_sale'}"}');`);
    await liveUser();
    await callFrequency();
    expect(await price()).toBe(22);
  });

  it.each(['pending','paid'])('preserves a %s package quote even before the lesson has a package link', async (status) => {
    await db.exec(`INSERT INTO lesson_packages VALUES('${id(601)}',NULL,'${status}');
      INSERT INTO pooled_package_quotes VALUES('${id(601)}',ARRAY['${id(201)}'::uuid]);`);
    await liveUser();
    await callFrequency();
    expect(await price()).toBe(29);
    expect(await price(202)).toBe(22);
  });

  it('allows repricing after the package quote was cancelled', async () => {
    await db.exec(`INSERT INTO lesson_packages VALUES('${id(601)}',now(),'cancelled');
      INSERT INTO pooled_package_quotes VALUES('${id(601)}',ARRAY['${id(201)}'::uuid]);`);
    await liveUser();
    await callFrequency();
    expect(await price()).toBe(22);
  });

  it('rolls the frequency and all lesson updates back if any repricing write fails', async () => {
    await db.exec(`CREATE FUNCTION fail_repricing() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='${id(202)}' THEN RAISE EXCEPTION 'Synthetic write failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_repricing BEFORE UPDATE OF price ON sessions FOR EACH ROW EXECUTE FUNCTION fail_repricing();`);
    try {
      await liveUser();
      await expect(callFrequency()).rejects.toThrow('Synthetic write failure');
      expect(await price()).toBe(29);
      expect(await price(202)).toBe(29);
      expect((await db.query<{ frequency: number }>('SELECT pricing_lessons_per_week AS frequency FROM students WHERE id=$1', [id(101)])).rows[0].frequency).toBe(1);
    } finally { await db.exec('DROP TRIGGER fail_repricing ON sessions; DROP FUNCTION fail_repricing()'); }
  });
});
