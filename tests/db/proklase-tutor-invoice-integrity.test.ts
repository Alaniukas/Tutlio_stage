import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261009150000_proklase_tutor_invoice_integrity.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), tutor = id(2), otherTutor = id(3), profile = id(12);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE invoice_profiles(id uuid PRIMARY KEY, user_id uuid, invoice_series text DEFAULT 'SF',
      next_invoice_number int DEFAULT 1, updated_at timestamptz);
    CREATE TABLE students(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE sessions(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid REFERENCES students,
      status text, status_confirmed_at timestamptz, end_time timestamptz, paid boolean DEFAULT false);
    CREATE TABLE invoices(id uuid PRIMARY KEY, invoice_number text NOT NULL, organization_id uuid,
      issued_by_user_id uuid, seller_user_id uuid, seller_snapshot jsonb, buyer_snapshot jsonb,
      issue_date date, period_start date, period_end date, grouping_type text, subtotal numeric,
      total_amount numeric, status text, origin text, billing_batch_id uuid, pdf_meta jsonb,
      pdf_storage_path text, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX seller_number ON invoices(seller_user_id, invoice_number) WHERE seller_user_id IS NOT NULL;
    CREATE UNIQUE INDEX org_number ON invoices(organization_id, invoice_number) WHERE seller_user_id IS NULL;
    CREATE TABLE invoice_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid REFERENCES invoices,
      description text NOT NULL, quantity numeric NOT NULL CHECK(quantity>0), unit_price numeric NOT NULL,
      total_price numeric NOT NULL, session_ids uuid[]);
  `);
  await db.exec(migration);
}, 30_000);
beforeEach(async () => {
  await db.exec('TRUNCATE invoice_line_items, invoices, sessions, students, invoice_profiles, profiles CASCADE');
  await db.query('INSERT INTO profiles VALUES($1,$3),($2,$3)', [tutor, otherTutor, org]);
  await db.query('INSERT INTO invoice_profiles(id,user_id,next_invoice_number) VALUES($1,$2,8),($3,$4,2)',
    [profile, tutor, id(13), otherTutor]);
  await db.query('INSERT INTO students VALUES($1,$2)', [id(4), org]);
  for (const n of [5, 6]) await db.query("INSERT INTO sessions VALUES($1,$2,$3,'completed','2020-09-01','2020-09-01',false)",
    [id(n), tutor, id(4)]);
});
afterAll(async () => { await db?.close(); });

async function oldInvoice(number = 'SF-001', sessionIds = [id(5)], overrides: Record<string, unknown> = {}) {
  const row = { id: id(20), organization_id: org, issued_by_user_id: id(9), seller_user_id: tutor,
    invoice_number: number, status: 'paid', origin: 'generated', total_amount: 10, subtotal: 10,
    period_start: '2026-09-01', period_end: '2026-10-02', pdf_storage_path: 'old.pdf',
    pdf_meta: { invoiceKind: 'tutor_pay', tutorId: tutor }, ...overrides };
  await db.query(`INSERT INTO invoices SELECT * FROM jsonb_populate_record(NULL::invoices,$1)`, [row]);
  await db.query("INSERT INTO invoice_line_items(invoice_id,description,quantity,unit_price,total_price,session_ids) VALUES($1,'Math',1,10,10,$2)", [row.id, sessionIds]);
  return row;
}
const invoice = (number = 'DOMSMA-008', overrides: Record<string, unknown> = {}) => ({
  invoice_number: number, organization_id: org, seller_user_id: tutor, issued_by_user_id: id(9),
  seller_snapshot: { name: 'Dominykas Smaliukas' }, buyer_snapshot: { name: 'Organization' },
  issue_date: '2026-10-09', period_start: '2026-10-01', period_end: '2026-10-31', grouping_type: 'single',
  subtotal: 10, total_amount: 10, pdf_meta: { invoiceKind: 'tutor_pay', tutorId: tutor, tutorAdjustmentIds: [] }, ...overrides,
});
const lines = (sessionIds = [id(6)]) => [{ description: 'Math', quantity: 1, unit_price: 10, total_price: 10, session_ids: sessionIds }];
const create = async (row = invoice(), items = lines()) => (await db.query<{ invoice: any }>(
  'SELECT create_org_tutor_pay_invoice($1,$2,$3,$4) AS invoice', [org, tutor, row, items])).rows[0].invoice;
const allocate = async (profileId = profile, series = 'DOMSMA') => (await db.query<{ invoice_series: string; allocated_number: number }>(
  'SELECT * FROM allocate_org_tutor_invoice_number($1,$2,$3)', [org, profileId, series])).rows[0];
const correct = async (newNumber = 'DOMSMA-001', expectedNumber = 'SF-001') => (await db.query<{ invoice: any }>(
  'SELECT correct_org_tutor_invoice_number($1,$2,$3,$4,$5) AS invoice', [org, id(20), expectedNumber, newNumber, id(9)])).rows[0].invoice;

describe('actual PostgreSQL Pro Klasė tutor invoice integrity', () => {
  it('uses separate tutor series, preserves the next counter, and leaves historical numbers unchanged', async () => {
    await oldInvoice();
    expect(await allocate()).toEqual({ invoice_series: 'DOMSMA', allocated_number: 8 });
    expect(await allocate(id(13))).toEqual({ invoice_series: 'DOMSMA2', allocated_number: 2 });
    expect((await db.query('SELECT invoice_number,status FROM invoices')).rows).toEqual([{ invoice_number: 'SF-001', status: 'paid' }]);
  });
  it('retains a tutor custom series and skips numbers used elsewhere in the organization', async () => {
    await db.query("UPDATE invoice_profiles SET invoice_series='CUSTOM' WHERE id=$1", [profile]);
    await oldInvoice('CUSTOM-008', [], { seller_user_id: otherTutor, pdf_meta: { invoiceKind: 'tutor_pay', tutorId: tutor } });
    expect(await allocate()).toEqual({ invoice_series: 'CUSTOM', allocated_number: 9 });
    expect(await allocate()).toEqual({ invoice_series: 'CUSTOM', allocated_number: 10 });
  });
  it('rejects a foreign tutor profile without advancing its counter', async () => {
    await db.query('UPDATE profiles SET organization_id=$1 WHERE id=$2', [id(100), tutor]);
    await expect(allocate()).rejects.toThrow('not in organization');
    expect((await db.query('SELECT next_invoice_number FROM invoice_profiles WHERE id=$1', [profile])).rows[0]).toEqual({ next_invoice_number: 8 });
  });
  it('blocks a lesson already paid in an overlapping previous period', async () => {
    await oldInvoice();
    await expect(create(invoice(), lines([id(5)]))).rejects.toMatchObject({ code: '40001' });
    expect((await db.query('SELECT count(*) AS n FROM invoices')).rows[0].n).toBe(1);
  });
  it('allows only the unbilled lessons and never changes student payment state', async () => {
    await oldInvoice();
    const saved = await create();
    expect(saved).toMatchObject({ invoice_number: 'DOMSMA-008', status: 'issued', total_amount: 10 });
    expect((await db.query('SELECT session_ids FROM invoice_line_items WHERE invoice_id=$1', [saved.id])).rows).toEqual([{ session_ids: [id(6)] }]);
    expect((await db.query('SELECT paid FROM sessions')).rows.map((row: any) => row.paid)).toEqual([false, false]);
  });
  it.each([
    { status: 'cancelled' },
    { pdf_meta: { invoiceKind: 'customer', tutorId: tutor } },
    { pdf_meta: { invoiceKind: 'tutor_pay', tutorId: otherTutor } },
    { organization_id: id(99) },
  ])('does not treat an unrelated or cancelled invoice as own tutor pay: %j', async overrides => {
    await oldInvoice('SF-001', [id(5)], overrides);
    expect(await create(invoice(), lines([id(5)]))).toMatchObject({ status: 'issued' });
  });
  it('rejects concurrent requests for the same lessons after one succeeds', async () => {
    const results = await Promise.allSettled([create(), create(invoice('DOMSMA-009'))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: '40001' } });
    expect((await db.query('SELECT count(*) AS n FROM invoices')).rows[0].n).toBe(1);
  });
  it('deduplicates adjustment IDs across periods', async () => {
    await oldInvoice('SF-001', [], { pdf_meta: { invoiceKind: 'tutor_pay', tutorId: tutor, tutorAdjustmentIds: [id(90)] } });
    await expect(create(invoice('DOMSMA-008', { pdf_meta: { invoiceKind: 'tutor_pay', tutorId: tutor, tutorAdjustmentIds: [id(90)] } })))
      .rejects.toMatchObject({ code: '40001' });
  });
  it.each(['unconfirmed', 'not_ended', 'foreign_student'])('rejects changed lesson eligibility: %s', async kind => {
    if (kind === 'unconfirmed') await db.exec('UPDATE sessions SET status_confirmed_at=NULL');
    if (kind === 'not_ended') await db.exec("UPDATE sessions SET end_time=now()+interval '1 day'");
    if (kind === 'foreign_student') await db.query('UPDATE students SET organization_id=$1', [id(99)]);
    await expect(create()).rejects.toMatchObject({ code: '40001' });
    expect((await db.query('SELECT count(*) AS n FROM invoices')).rows[0].n).toBe(0);
  });
  it('rolls back the invoice when a line cannot be inserted', async () => {
    await expect(create(invoice(), [{ ...lines()[0], quantity: 0 }])).rejects.toMatchObject({ code: '23514' });
    expect((await db.query('SELECT count(*) AS n FROM invoices')).rows[0].n).toBe(0);
  });
  it('corrects a paid number while preserving amounts, lessons, status and adjustment history', async () => {
    await oldInvoice();
    const saved = await correct();
    expect(saved).toMatchObject({ invoice_number: 'DOMSMA-001', status: 'paid', total_amount: 10, subtotal: 10,
      pdf_storage_path: null, issued_by_user_id: id(9), seller_user_id: tutor,
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: tutor, numberCorrections: [{ previousNumber: 'SF-001', number: 'DOMSMA-001', changedBy: id(9), previousPdfPath: 'old.pdf' }] } });
    expect((await db.query('SELECT session_ids,total_price::float AS total_price FROM invoice_line_items WHERE invoice_id=$1', [id(20)])).rows)
      .toEqual([{ session_ids: [id(5)], total_price: 10 }]);
    expect((await correct('DOMSMA-001', 'DOMSMA-001')).pdf_meta.numberCorrections).toHaveLength(1);
  });
  it('rejects stale edits and a number already used by another seller, case insensitively', async () => {
    await oldInvoice();
    await expect(correct('DOMSMA-001', 'SF-999')).rejects.toMatchObject({ code: '40001' });
    await oldInvoice('PIJSEM-001', [], { id: id(21), seller_user_id: otherTutor, pdf_meta: { invoiceKind: 'tutor_pay', tutorId: otherTutor } });
    await expect(correct('pijsem-001')).rejects.toMatchObject({ code: '23505' });
    expect((await db.query('SELECT invoice_number FROM invoices WHERE id=$1', [id(20)])).rows[0]).toEqual({ invoice_number: 'SF-001' });
  });
  it('accepts Lithuanian letters in tutor invoice series', async () => {
    await oldInvoice();
    expect(await correct('KAMČEB-001')).toMatchObject({ invoice_number: 'KAMČEB-001', status: 'paid' });
  });
  it('keeps the three mutation functions executable only by the service role', async () => {
    for (const signature of ['allocate_org_tutor_invoice_number(uuid,uuid,text)', 'create_org_tutor_pay_invoice(uuid,uuid,jsonb,jsonb)',
      'correct_org_tutor_invoice_number(uuid,uuid,text,text,uuid)']) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const result = await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature]);
        expect(result.rows[0].allowed).toBe(role === 'service_role');
      }
    }
  });
});
