// In-memory regression for the one-time Vakarė price correction. No live DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const correction = await readFile(new URL('../../supabase/migrations/20260929101534_proklase_vakare_session_price_correction.sql', import.meta.url), 'utf8');
const student = '231f729f-7921-4164-9a36-ad41ca296844';
const tutor = '8a33c53f-11f8-41c4-b29c-7d37cefeee6a';
const subject = 'c3b4f797-8892-40b7-bf02-42aac88a8b22';
const org = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
const recurring = [
  '1cdb4924-9b2a-4afa-88b0-e29e070e10a3',
  '52e741e5-4e31-4617-ad6c-c699fa37a312',
];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
  await db.exec(`
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE students(id uuid PRIMARY KEY, tutor_id uuid, organization_id uuid, detached_at timestamptz);
    CREATE TABLE subjects(id uuid PRIMARY KEY, tutor_id uuid, is_trial boolean DEFAULT false);
    CREATE TABLE student_individual_pricing(id uuid PRIMARY KEY, student_id uuid, tutor_id uuid,
      subject_id uuid, price numeric, created_at timestamptz);
    CREATE TABLE invoice_line_items(session_ids uuid[]);
    CREATE TABLE sessions(id uuid PRIMARY KEY, student_id uuid, tutor_id uuid, subject_id uuid,
      recurring_session_id uuid, created_at timestamptz, start_time timestamptz, price numeric,
      status text, paid boolean, payment_status text, lesson_package_id uuid, payment_batch_id uuid,
      is_complimentary boolean DEFAULT false, is_makeup boolean DEFAULT false);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY, pool_organization_id uuid, pool_identity_key text,
      billing_period_start date, billing_period_end date, paid boolean);
    CREATE TABLE pooled_package_quotes(package_id uuid PRIMARY KEY, session_ids uuid[]);
    CREATE TABLE lesson_package_items(package_id uuid, subject_id uuid, price_per_lesson numeric);
    CREATE FUNCTION package_student_identity(p_student students) RETURNS text LANGUAGE sql AS $$ SELECT 'same'::text $$;
  `);
  await db.query('INSERT INTO profiles VALUES($1,$2)', [tutor, org]);
  await db.query('INSERT INTO students(id,tutor_id,organization_id) VALUES($1,$2,$3),($4,$2,$3)', [student, tutor, org, id(99)]);
  await db.query('INSERT INTO subjects(id,tutor_id) VALUES($1,$2),($3,$2)', [subject, tutor, id(98)]);
  await db.query('INSERT INTO student_individual_pricing VALUES($1,$2,$3,$4,25,$5)',
    ['ca40b639-9f05-460e-b88e-01211e71235a', student, tutor, subject, '2026-09-25 10:37:00.243247+03']);

  const standard = {
    student, tutor, subject, recurrence: recurring[0],
    created: '2026-09-25 06:52:54.425784+03', start: '2026-10-06 18:10:00+03',
    price: 31, status: 'active', paid: false, paymentStatus: 'pending', packageId: null, batchId: null,
  };
  const rows = [
    { ...standard, id: id(1) },
    { ...standard, id: id(2), recurrence: recurring[1], status: 'completed' },
    { ...standard, id: id(3), paid: true },
    { ...standard, id: id(4), packageId: id(40) },
    { ...standard, id: id(5), batchId: id(50) },
    { ...standard, id: id(6), price: 28 },
    { ...standard, id: id(7), status: 'cancelled' },
    { ...standard, id: id(8), recurrence: id(80) },
    { ...standard, id: id(9), subject: id(98) },
    { ...standard, id: id(10), student: id(99) },
    { ...standard, id: id(11), created: '2026-09-25 11:00:00+03' },
    { ...standard, id: id(12), paymentStatus: 'paid' },
    { ...standard, id: id(13) },
  ];
  for (const row of rows) {
    await db.query(`INSERT INTO sessions(id,student_id,tutor_id,subject_id,recurring_session_id,
      created_at,start_time,price,status,paid,payment_status,lesson_package_id,payment_batch_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [row.id, row.student, row.tutor, row.subject, row.recurrence, row.created, row.start,
        row.price, row.status, row.paid, row.paymentStatus, row.packageId, row.batchId]);
  }
  await db.query('INSERT INTO invoice_line_items(session_ids) VALUES($1)', [[id(13)]]);

  await db.exec(correction);
  const prices = (await db.query('SELECT id, price::text FROM sessions ORDER BY id')).rows;
  assert.equal(Number(prices.find(row => row.id === id(1)).price), 25);
  assert.equal(Number(prices.find(row => row.id === id(2)).price), 25);
  for (const unchanged of rows.slice(2)) {
    assert.equal(Number(prices.find(row => row.id === unchanged.id).price), unchanged.price,
      `otherwise modified row ${unchanged.id} must retain its price`);
  }

  await db.exec(correction); // Applying it twice must be harmless.
  assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE price=25')).rows[0].n, 2);

  await db.query('UPDATE student_individual_pricing SET price=26 WHERE student_id=$1', [student]);
  await db.query('UPDATE sessions SET price=31 WHERE id=$1', [id(1)]);
  await assert.rejects(db.exec(correction), /pairing or 25 EUR override changed/);
  assert.equal(Number((await db.query('SELECT price FROM sessions WHERE id=$1', [id(1)])).rows[0].price), 31);

  await db.exec(`CREATE TRIGGER apply_paid_pooled_package AFTER UPDATE OF paid ON lesson_packages
    FOR EACH ROW EXECUTE FUNCTION apply_paid_pooled_package()`);
  for (const [sessionId, subjectId] of [[id(14), subject], [id(15), id(98)]]) {
    await db.query(`INSERT INTO sessions(id,student_id,tutor_id,subject_id,start_time,price,status,paid,payment_status)
      VALUES($1,$2,$3,$4,'2026-10-06 18:10:00+03',31,'active',false,'pending')`,
      [sessionId, student, tutor, subjectId]);
  }
  await db.query(`INSERT INTO lesson_packages VALUES($1,$2,'same','2026-10-01','2026-10-31',false)`, [id(100), org]);
  await db.query('INSERT INTO pooled_package_quotes VALUES($1,$2)', [id(100), [id(14), id(15)]]);
  await db.query('INSERT INTO lesson_package_items VALUES($1,$2,25)', [id(100), subject]);
  await db.query('UPDATE lesson_packages SET paid=true WHERE id=$1', [id(100)]);
  const paidRows = (await db.query('SELECT id,price,paid,lesson_package_id FROM sessions WHERE id IN ($1,$2) ORDER BY id',
    [id(14), id(15)])).rows;
  assert.deepEqual(paidRows.map(row => [row.id, Number(row.price), row.paid, row.lesson_package_id]), [
    [id(14), 25, true, id(100)],
    [id(15), 31, true, id(100)],
  ], 'paid quoted lesson takes its subject item price; unmatched subject keeps its original price');
  console.log('PASS: guarded Vakarė correction and paid pooled-session price synchronization.');
} finally {
  await db.close();
}
