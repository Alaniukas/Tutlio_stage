// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261002104711_proklase_paid_source_invoices.sql', 'utf8');
const org = 'b0a00000-7e57-4000-8000-000000000001';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

async function issue(type = 'session', source = id(4), checkout: string | null = 'cs_paid', amount = 99) {
  const { rows } = await db.query<{ invoice: string | null }>(
    'SELECT public.issue_proklase_paid_source_invoice($1, $2::uuid, $3, $4::numeric) AS invoice',
    [type, source, checkout, amount],
  );
  return rows[0].invoice;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE students(id uuid PRIMARY KEY, full_name text, payer_name text, payer_email text, email text);
    CREATE TABLE subjects(id uuid PRIMARY KEY, name text);
    CREATE TABLE sessions(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, paid boolean,
      is_complimentary boolean DEFAULT false, lesson_package_id uuid, start_time timestamptz, subject_id uuid, topic text, price numeric);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, paid boolean, payment_status text,
      pool_organization_id uuid, pool_student_ids uuid[], total_lessons int, total_price numeric, paid_at timestamptz,
      subject_id uuid, manual_sales_invoice_id uuid);
    CREATE TABLE invoice_profiles(id uuid PRIMARY KEY, organization_id uuid, business_name text, company_code text,
      entity_type text, vat_code text, address text, activity_number text, contact_email text, contact_phone text,
      bank_name text, iban text, invoice_series text, next_invoice_number int);
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text UNIQUE,
      issued_by_user_id uuid, organization_id uuid, seller_user_id uuid, seller_snapshot jsonb, buyer_snapshot jsonb,
      issue_date date, period_start date, period_end date, grouping_type text, subtotal numeric, total_amount numeric,
      status text, source_session_id uuid UNIQUE, pdf_meta jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE invoice_line_items(invoice_id uuid, description text, quantity numeric, unit_price numeric,
      total_price numeric, session_ids uuid[]);
    CREATE TABLE lesson_package_items(package_id uuid, subject_id uuid, total_lessons int, total_price numeric, position int);
    CREATE TABLE platform_fee_ledger(source_type text, source_id uuid, provider text, organization_id uuid,
      base_amount numeric, paid_at timestamptz, stripe_checkout_session_id text, currency text, PRIMARY KEY(source_type, source_id));
    CREATE FUNCTION allocate_invoice_number(p_profile_id uuid) RETURNS TABLE(invoice_series text, allocated_number int)
      LANGUAGE sql AS $$ UPDATE invoice_profiles SET next_invoice_number = next_invoice_number + 1
        WHERE id = p_profile_id RETURNING invoice_series, next_invoice_number - 1 $$;
    INSERT INTO profiles VALUES ('${id(1)}', '${org}');
    INSERT INTO students VALUES ('${id(2)}', 'Test Student', 'Test Parent', 'parent@example.test', 'student@example.test');
    INSERT INTO subjects VALUES ('${id(3)}', 'Matematika'), ('${id(7)}', 'Fizika');
    INSERT INTO sessions(id, tutor_id, student_id, paid, start_time, subject_id, price)
      VALUES ('${id(4)}', '${id(1)}', '${id(2)}', true, '2026-09-10T21:30:00Z', '${id(3)}', 99);
    INSERT INTO invoice_profiles(id, organization_id, business_name, company_code, entity_type, invoice_series, next_invoice_number)
      VALUES ('${id(5)}', '${org}', 'Demo Legal Seller', '123456789', 'mb', 'SF', 20);
    INSERT INTO platform_fee_ledger VALUES ('session', '${id(4)}', 'stripe', '${org}', 29, '2026-09-10T10:00:00Z', 'cs_paid', 'EUR');
  `);
  await db.exec(migration);
});

afterEach(async () => db.close());

describe('Pro Klasė verified payment sales invoices', () => {
  it('uses the historical amount paid, organization seller, payer and local lesson date', async () => {
    const invoice = await issue();
    const { rows } = await db.query<any>('SELECT * FROM invoices WHERE id = $1', [invoice]);
    expect(rows[0]).toMatchObject({
      invoice_number: 'SF-020', organization_id: org, seller_user_id: null,
      total_amount: '29.00', subtotal: '29.00', status: 'paid', source_session_id: id(4),
      period_start: new Date('2026-09-11T00:00:00Z'), period_end: new Date('2026-09-11T00:00:00Z'),
      seller_snapshot: { name: 'Demo Legal Seller', companyCode: '123456789', taxExemptionNote: 'PVM neapmokestinama pagal LR PVMĮ 22 str.' },
      buyer_snapshot: { name: 'Test Parent', email: 'parent@example.test' },
      pdf_meta: { invoiceKind: 'customer_sale', paymentSourceType: 'session', paymentSourceId: id(4), stripeCheckoutSessionId: 'cs_paid' },
    });
    expect((await db.query('SELECT issue_date = CURRENT_DATE AS current_issue FROM invoices')).rows).toEqual([{ current_issue: true }]);
    expect((await db.query('SELECT quantity, total_price, session_ids FROM invoice_line_items')).rows).toEqual([
      { quantity: '1', total_price: '29.00', session_ids: [id(4)] },
    ]);
  });

  it('reuses a sales invoice on concurrent callers and webhook/payment-return replays', async () => {
    const invoices = await Promise.all([issue(), issue(), issue()]);
    expect(new Set(invoices).size).toBe(1);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 1 }]);
    expect((await db.query('SELECT next_invoice_number FROM invoice_profiles')).rows).toEqual([{ next_invoice_number: 21 }]);
  });

  it.each(['unpaid', 'complimentary', 'foreign organization'])('skips a %s lesson', async (kind) => {
    if (kind === 'unpaid') await db.exec('UPDATE sessions SET paid = false');
    if (kind === 'complimentary') await db.exec('UPDATE sessions SET is_complimentary = true');
    if (kind === 'foreign organization') await db.exec(`UPDATE profiles SET organization_id = '${id(99)}'`);
    expect(await issue()).toBeNull();
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 0 }]);
  });

  it('links a paid trial checkout to its one-lesson package and shares the invoice with package replays', async () => {
    await db.exec(`
      INSERT INTO lesson_packages(id, tutor_id, student_id, paid, payment_status, total_lessons, total_price, subject_id)
        VALUES ('${id(6)}', '${id(1)}', '${id(2)}', false, 'pending', 1, 10, '${id(3)}');
      UPDATE sessions SET lesson_package_id = '${id(6)}';
      UPDATE platform_fee_ledger SET base_amount = 10;
    `);
    const first = await issue();
    expect((await db.query('SELECT manual_sales_invoice_id, paid FROM lesson_packages')).rows).toEqual([
      { manual_sales_invoice_id: first, paid: false },
    ]);
    await db.exec(`
      UPDATE lesson_packages SET paid = true, payment_status = 'paid';
      INSERT INTO platform_fee_ledger VALUES ('package', '${id(6)}', 'stripe', '${org}', 10, now(), 'cs_paid', 'EUR');
    `);
    expect(await issue('package', id(6))).toBe(first);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 1 }]);
  });

  it('writes each subject line of a paid package and its invoice link atomically', async () => {
    await db.exec(`
      INSERT INTO lesson_packages(id, tutor_id, student_id, paid, total_lessons, total_price, subject_id)
        VALUES ('${id(6)}', '${id(1)}', '${id(2)}', true, 2, 60, '${id(3)}');
      INSERT INTO lesson_package_items VALUES ('${id(6)}', '${id(3)}', 1, 29, 0), ('${id(6)}', '${id(7)}', 1, 31, 1);
      UPDATE sessions SET lesson_package_id = '${id(6)}';
      INSERT INTO platform_fee_ledger VALUES ('package', '${id(6)}', 'stripe', '${org}', 60, now(), 'cs_paid', 'EUR');
    `);
    const first = await issue('package', id(6));
    expect(await issue('package', id(6))).toBe(first);
    expect((await db.query('SELECT total_amount, status FROM invoices')).rows).toEqual([{ total_amount: '60.00', status: 'paid' }]);
    expect((await db.query('SELECT description, total_price, session_ids FROM invoice_line_items ORDER BY total_price')).rows).toEqual([
      { description: 'Matematika - pamokų paketas (1 pam.)', total_price: '29', session_ids: [id(6), id(4)] },
      { description: 'Fizika - pamokų paketas (1 pam.)', total_price: '31', session_ids: [id(6), id(4)] },
    ]);
    expect((await db.query('SELECT manual_sales_invoice_id FROM lesson_packages')).rows).toEqual([{ manual_sales_invoice_id: first }]);
    expect(await issue()).toBeNull(); // One lesson checkout cannot settle this larger package.
  });

  it('preserves an existing customer invoice and only marks its full amount paid', async () => {
    await db.exec(`
      INSERT INTO invoices(id, invoice_number, organization_id, seller_snapshot, status, total_amount)
        VALUES ('${id(8)}', 'SF-001', '${org}', '{"companyCode":"123456789"}', 'issued', 29);
      INSERT INTO invoice_line_items(invoice_id, session_ids) VALUES ('${id(8)}', ARRAY['${id(4)}'::uuid]);
    `);
    expect(await issue()).toBe(id(8));
    expect((await db.query('SELECT status FROM invoices')).rows).toEqual([{ status: 'paid' }]);
    await db.exec(`UPDATE invoices SET total_amount = 100, status = 'issued'`);
    expect(await issue()).toBe(id(8));
    expect((await db.query('SELECT status FROM invoices')).rows).toEqual([{ status: 'issued' }]);
  });

  it('never treats a tutor-pay invoice as the customer sales invoice', async () => {
    await db.exec(`
      INSERT INTO invoices(id, invoice_number, organization_id, seller_snapshot, status, total_amount, pdf_meta)
        VALUES ('${id(8)}', 'PAY-001', '${org}', '{"companyCode":"123456789"}', 'issued', 20, '{"invoiceKind":"tutor_pay"}');
      INSERT INTO invoice_line_items(invoice_id, session_ids) VALUES ('${id(8)}', ARRAY['${id(4)}'::uuid]);
    `);
    expect(await issue()).not.toBe(id(8));
    expect((await db.query('SELECT status FROM invoices WHERE id = $1', [id(8)])).rows).toEqual([{ status: 'issued' }]);
  });

  it('rolls back the invoice and serial number if its line cannot be written', async () => {
    await db.exec('ALTER TABLE invoice_line_items ADD CONSTRAINT simulated_failure CHECK (total_price < 0)');
    await expect(issue()).rejects.toThrow(/simulated_failure/);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 0 }]);
    expect((await db.query('SELECT next_invoice_number FROM invoice_profiles')).rows).toEqual([{ next_invoice_number: 20 }]);
    await db.exec('ALTER TABLE invoice_line_items DROP CONSTRAINT simulated_failure');
    expect(await issue()).toBeTruthy();
  });

  it('rejects mismatched Checkout evidence without allocating an invoice', async () => {
    await expect(issue('session', id(4), 'cs_different')).rejects.toThrow(/evidence/);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 0 }]);
  });

  it('handles a verified zero-fee checkout when there is no platform-fee ledger row', async () => {
    await db.exec('DELETE FROM platform_fee_ledger');
    expect(await issue('session', id(4), null, 29)).toBeNull();
    const invoice = await issue('session', id(4), 'cs_verified_without_fee', 27);
    expect(invoice).toBeTruthy();
    expect(await issue('session', id(4), 'cs_verified_without_fee', 27)).toBe(invoice);
    expect((await db.query('SELECT total_amount FROM invoices')).rows).toEqual([{ total_amount: '27.00' }]);
  });

  it('keeps the invoice RPC unavailable to browser roles', async () => {
    const signature = 'public.issue_proklase_paid_source_invoice(text,uuid,text,numeric)';
    expect((await db.query('SELECT has_function_privilege($1, $2, $3) AS allowed', ['authenticated', signature, 'execute'])).rows).toEqual([{ allowed: false }]);
    expect((await db.query('SELECT has_function_privilege($1, $2, $3) AS allowed', ['anon', signature, 'execute'])).rows).toEqual([{ allowed: false }]);
    expect((await db.query('SELECT has_function_privilege($1, $2, $3) AS allowed', ['service_role', signature, 'execute'])).rows).toEqual([{ allowed: true }]);
  });
});
