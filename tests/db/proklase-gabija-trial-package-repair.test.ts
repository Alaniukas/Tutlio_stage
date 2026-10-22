// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const repair = readFileSync('scripts/sql/repair-proklase-gabija-trial-package-20261022.sql', 'utf8');
const student = '19c2a1e4-ec13-4953-9b59-a1dd3a4d9536';
const tutor = '2f549baf-5811-42dd-8cf9-90b6e0dd0543';
const org = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
const lesson = 'c3f95c8b-fa4f-4b01-8f9a-378de6ef58a0';
const pkg = '6d969735-bede-4575-a980-a65c549ced35';
const item = '40801108-3940-46bf-8529-d30aa5010f60';
const purchasedSubject = 'f6a36590-9a58-4c08-8ce5-4fd2f8913645';
const currentSubject = '5d12aa35-bfc3-459a-8886-e540166ba3df';
const invoice = 'f5bcd8f1-fd3d-45ff-8720-f07d402744b6';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    SET search_path = public, pg_catalog;
    CREATE FUNCTION public.clock_timestamp() RETURNS timestamptz LANGUAGE sql AS $$SELECT '2026-10-22 14:30+03'::timestamptz$$;
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,tutor_id uuid,linked_user_id uuid,detached_at timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid);
    CREATE TABLE subjects(id uuid PRIMARY KEY,tutor_id uuid,is_trial boolean,price numeric,duration_minutes integer);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,subject_id uuid,pool_organization_id uuid,
      paid boolean,payment_status text,active boolean,total_lessons integer,total_price numeric,price_per_lesson numeric,
      manual_sales_invoice_id uuid,expires_at timestamptz,available_lessons numeric,reserved_lessons numeric,completed_lessons numeric);
    CREATE TABLE lesson_package_items(id uuid PRIMARY KEY,package_id uuid,subject_id uuid,total_lessons integer,
      total_price numeric,price_per_lesson numeric,available_lessons numeric,reserved_lessons numeric,completed_lessons numeric);
    CREATE TABLE sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,subject_id uuid,status text,paid boolean,payment_status text,
      price numeric,start_time timestamptz,end_time timestamptz,status_confirmed_at timestamptz,student_joined_at timestamptz,
      tutor_joined_at timestamptz,is_complimentary boolean,is_makeup boolean,class_group_id uuid,stripe_checkout_session_id text,
      lesson_package_id uuid,topic text DEFAULT 'Trial');
    CREATE TABLE invoices(id uuid PRIMARY KEY,organization_id uuid,status text,total_amount numeric,pdf_meta jsonb,invoice_number text,source_session_id uuid);
    CREATE TABLE invoice_line_items(id uuid PRIMARY KEY,invoice_id uuid,session_ids uuid[],total_price numeric);
    CREATE TABLE payments(id uuid PRIMARY KEY,session_id uuid);
  `);
}, 30_000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`
    DROP TRIGGER IF EXISTS fail_item ON lesson_package_items;
    TRUNCATE students,profiles,subjects,sessions,lesson_packages,lesson_package_items,invoices,invoice_line_items,payments;
    INSERT INTO students VALUES ('${student}','${org}','${tutor}','0caf7ad4-36c7-4b73-9d15-e2ef24974b76',null);
    INSERT INTO profiles VALUES ('${tutor}','${org}');
    INSERT INTO subjects VALUES ('${purchasedSubject}','${tutor}',true,10,45),('${currentSubject}','${tutor}',true,10,45);
    INSERT INTO lesson_packages VALUES ('${pkg}','${student}','${tutor}','${purchasedSubject}',null,
      true,'paid',true,1,10,10,'${invoice}','2026-11-16 18:14+02',1,0,0);
    INSERT INTO lesson_package_items VALUES ('${item}','${pkg}','${purchasedSubject}',1,10,10,1,0,0);
    INSERT INTO sessions(id,student_id,tutor_id,subject_id,status,paid,payment_status,price,start_time,end_time)
      VALUES ('${lesson}','${student}','${tutor}','${currentSubject}','active',true,'paid',10,'2026-10-22 16:55+03','2026-10-22 17:40+03'),
      ('11111111-1111-4111-8111-111111111111','${student}','${tutor}','${currentSubject}','active',false,'pending',29,
        '2026-10-29 16:55+02','2026-10-29 17:55+02');
    INSERT INTO invoices(id,organization_id,status,total_amount,pdf_meta,invoice_number) VALUES ('${invoice}','${org}','paid',10.41,
      '{"invoiceKind":"customer_sale","paymentSourceType":"package","paymentSourceId":"${pkg}"}','SF-149');
    INSERT INTO invoice_line_items VALUES ('22222222-2222-4222-8222-222222222222','${invoice}',ARRAY['${pkg}']::uuid[],10),
      ('33333333-3333-4333-8333-333333333333','${invoice}','{}'::uuid[],0.41);
  `);
});

async function apply() {
  try { await db.exec(repair); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ['students','sessions','lesson_packages','lesson_package_items','invoices','invoice_line_items']) {
    result[table] = (await db.query(`SELECT to_jsonb(r) AS row FROM ${table} r ORDER BY r.id`)).rows;
  }
  return result;
}

describe('Exact paid-trial credit correction', () => {
  it('reserves the purchased credit and aligns the lesson subject without changing the invoice or later lesson', async () => {
    const before = await snapshot();
    const other = await db.query(`SELECT to_jsonb(s) AS row FROM sessions s WHERE id <> '${lesson}'`);
    await apply();
    expect((await db.query(`SELECT lesson_package_id,subject_id,price::float AS price,paid FROM sessions WHERE id='${lesson}'`)).rows)
      .toEqual([{ lesson_package_id: pkg, subject_id: purchasedSubject, price: 10, paid: true }]);
    for (const table of ['lesson_packages','lesson_package_items']) {
      expect((await db.query(`SELECT available_lessons::int AS available,reserved_lessons::int AS reserved,completed_lessons::int AS completed FROM ${table}`)).rows)
        .toEqual([{ available: 0, reserved: 1, completed: 0 }]);
    }
    const after = await snapshot();
    expect(after.invoices).toEqual(before.invoices);
    expect(after.invoice_line_items).toEqual(before.invoice_line_items);
    expect(after.students).toEqual(before.students);
    expect(await db.query(`SELECT to_jsonb(s) AS row FROM sessions s WHERE id <> '${lesson}'`)).toEqual(other);
  });

  it('does not reserve a second credit on a retry', async () => {
    await apply();
    const after = await snapshot();
    await apply();
    expect(await snapshot()).toEqual(after);
  });

  it.each([
    ['changed package price', `UPDATE lesson_packages SET total_price=29`],
    ['used credit', `UPDATE lesson_package_items SET available_lessons=0,reserved_lessons=1`],
    ['separate payment', `INSERT INTO payments VALUES ('44444444-4444-4444-8444-444444444444','${lesson}')`],
    ['another allocation', `UPDATE sessions SET lesson_package_id='${pkg}' WHERE id<>'${lesson}'`],
    ['started lesson', `UPDATE sessions SET student_joined_at='2026-10-22 16:55+03' WHERE id='${lesson}'`],
    ['changed invoice', `UPDATE invoices SET total_amount=29`],
  ])('refuses %s without changing any remaining rows', async (_name, drift) => {
    await db.exec(drift);
    const before = await snapshot();
    await expect(apply()).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back the lesson link and aggregate reservation if the last item update fails', async () => {
    await db.exec(`CREATE OR REPLACE FUNCTION public.reject_item() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'late item failure'; END; $$;
      CREATE TRIGGER fail_item BEFORE UPDATE ON lesson_package_items FOR EACH ROW EXECUTE FUNCTION reject_item();`);
    const before = await snapshot();
    await expect(apply()).rejects.toThrow('late item failure');
    expect(await snapshot()).toEqual(before);
  });
});
