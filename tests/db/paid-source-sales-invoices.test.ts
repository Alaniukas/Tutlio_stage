// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261002110334_universal_paid_source_invoices.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(10);
let db: PGlite;

async function issue(type = 'session', source = id(4), checkout: string | null = 'cs_paid', amount = 99, currency = 'EUR') {
  const { rows } = await db.query<{ invoice: string | null }>(
    'SELECT public.issue_paid_source_sales_invoice($1, $2::uuid, $3, $4::numeric, $5) AS invoice',
    [type, source, checkout, amount, currency],
  );
  return rows[0].invoice;
}

async function addPackage(lessons = 2) {
  await db.exec(`
    INSERT INTO lesson_packages(id, tutor_id, student_id, paid, payment_status, total_lessons, total_price, subject_id)
      VALUES ('${id(6)}', '${id(1)}', '${id(2)}', true, 'paid', ${lessons}, 60, '${id(3)}');
    INSERT INTO lesson_package_items VALUES ('${id(6)}', '${id(3)}', 1, 29, 0), ('${id(6)}', '${id(7)}', 1, 31, 1);
    UPDATE sessions SET lesson_package_id = '${id(6)}';
    INSERT INTO platform_fee_ledger VALUES ('package', '${id(6)}', 'stripe', '${org}', 60, now(), 'cs_paid', 'EUR');
  `);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY, entity_type text, features jsonb DEFAULT '{}');
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid, full_name text);
    CREATE TABLE students(id uuid PRIMARY KEY, full_name text, payer_name text, payer_email text, email text);
    CREATE TABLE subjects(id uuid PRIMARY KEY, name text);
    CREATE TABLE sessions(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, paid boolean,
      is_complimentary boolean DEFAULT false, lesson_package_id uuid, start_time timestamptz, subject_id uuid, topic text, price numeric);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, paid boolean, payment_status text,
      pool_organization_id uuid, pool_student_ids uuid[], total_lessons int, total_price numeric, paid_at timestamptz,
      subject_id uuid, manual_sales_invoice_id uuid);
    CREATE TABLE invoice_profiles(id uuid PRIMARY KEY, organization_id uuid, user_id uuid, business_name text, company_code text,
      entity_type text, vat_code text, address text, activity_number text, personal_code text, contact_email text, contact_phone text,
      bank_name text, iban text, invoice_series text, next_invoice_number int);
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text,
      issued_by_user_id uuid, organization_id uuid, seller_user_id uuid, seller_snapshot jsonb, buyer_snapshot jsonb,
      issue_date date, period_start date, period_end date, grouping_type text, subtotal numeric, total_amount numeric,
      status text, source_session_id uuid UNIQUE, pdf_meta jsonb, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX org_invoice_number ON invoices(organization_id, invoice_number)
      WHERE organization_id IS NOT NULL AND seller_user_id IS NULL;
    CREATE UNIQUE INDEX personal_invoice_number ON invoices(seller_user_id, invoice_number) WHERE seller_user_id IS NOT NULL;
    CREATE TABLE invoice_line_items(invoice_id uuid, description text, quantity numeric, unit_price numeric,
      total_price numeric, session_ids uuid[]);
    CREATE TABLE lesson_package_items(package_id uuid, subject_id uuid, total_lessons int, total_price numeric, position int);
    CREATE TABLE platform_fee_ledger(source_type text, source_id uuid, provider text, organization_id uuid,
      base_amount numeric, paid_at timestamptz, stripe_checkout_session_id text, currency text, PRIMARY KEY(source_type, source_id));
    CREATE FUNCTION allocate_invoice_number(p_profile_id uuid) RETURNS TABLE(invoice_series text, allocated_number int)
      LANGUAGE sql AS $$ UPDATE invoice_profiles SET next_invoice_number = next_invoice_number + 1
        WHERE id = p_profile_id RETURNING invoice_series, next_invoice_number - 1 $$;
    INSERT INTO organizations(id, entity_type) VALUES ('${org}', 'company');
    INSERT INTO profiles VALUES ('${id(1)}', '${org}', 'Test Tutor');
    INSERT INTO students VALUES ('${id(2)}', 'Test Student', 'Test Parent', 'parent@example.test', 'student@example.test');
    INSERT INTO subjects VALUES ('${id(3)}', 'Matematika'), ('${id(7)}', 'Fizika');
    INSERT INTO sessions(id, tutor_id, student_id, paid, start_time, subject_id, price)
      VALUES ('${id(4)}', '${id(1)}', '${id(2)}', true, '2026-09-10T21:30:00Z', '${id(3)}', 99);
    INSERT INTO invoice_profiles(id, organization_id, business_name, company_code, entity_type, address, contact_email, invoice_series, next_invoice_number)
      VALUES ('${id(5)}', '${org}', 'Other Organization Legal Seller', '123456789', 'mb', 'Test Address', 'org@example.test', 'SF', 20);
    INSERT INTO platform_fee_ledger VALUES ('session', '${id(4)}', 'stripe', '${org}', 29, '2026-09-10T10:00:00Z', 'cs_paid', 'EUR');
  `);
  await db.exec(migration);
});
afterEach(async () => db.close());

describe('shared organization sales invoices', () => {
  it('invoices another organization with its own seller, payer, paid amount and local lesson date', async () => {
    const invoice = await issue();
    const { rows } = await db.query<any>('SELECT * FROM invoices WHERE id = $1', [invoice]);
    expect(rows[0]).toMatchObject({ invoice_number: 'SF-020', organization_id: org, seller_user_id: null,
      total_amount: '29.00', status: 'paid', period_start: new Date('2026-09-11T00:00:00Z'),
      seller_snapshot: { name: 'Other Organization Legal Seller', companyCode: '123456789', contactEmail: 'org@example.test' },
      buyer_snapshot: { name: 'Test Parent', email: 'parent@example.test' },
      pdf_meta: { invoiceKind: 'customer_sale', currency: 'EUR', paymentSourceType: 'session', paymentSourceId: id(4) } });
    expect(rows[0].seller_snapshot).not.toHaveProperty('taxExemptionNote');
    expect((await db.query('SELECT total_price, session_ids FROM invoice_line_items')).rows)
      .toEqual([{ total_price: '29.00', session_ids: [id(4)] }]);
  });

  it('shares one invoice and number across repeated callbacks', async () => {
    expect(new Set(await Promise.all([issue(), issue(), issue()])).size).toBe(1);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 1 }]);
    expect((await db.query('SELECT next_invoice_number FROM invoice_profiles')).rows).toEqual([{ next_invoice_number: 21 }]);
  });

  it('keeps seller details and invoice number allocation separate between two organizations', async () => {
    const otherOrg = id(20);
    await db.exec(`INSERT INTO organizations(id, entity_type) VALUES ('${otherOrg}', 'company');
      INSERT INTO profiles VALUES ('${id(21)}', '${otherOrg}', 'Other Tutor');
      INSERT INTO sessions(id, tutor_id, student_id, paid, start_time, subject_id)
        VALUES ('${id(24)}', '${id(21)}', '${id(2)}', true, now(), '${id(3)}');
      INSERT INTO invoice_profiles(id, organization_id, business_name, company_code, entity_type, address, contact_email, invoice_series, next_invoice_number)
        VALUES ('${id(25)}', '${otherOrg}', 'Second Legal Seller', '987654321', 'uab', 'Other Address', 'other@example.test', 'SF', 20);
      INSERT INTO platform_fee_ledger VALUES ('session', '${id(24)}', 'stripe', '${otherOrg}', 40, now(), 'cs_other', 'EUR');`);
    const first = await issue();
    const second = await issue('session', id(24), 'cs_other', 40);
    expect(first).not.toBe(second);
    expect((await db.query<any>('SELECT invoice_number, organization_id, seller_snapshot FROM invoices ORDER BY organization_id')).rows)
      .toMatchObject([{ invoice_number: 'SF-020', organization_id: org, seller_snapshot: { name: 'Other Organization Legal Seller' } },
        { invoice_number: 'SF-020', organization_id: otherOrg, seller_snapshot: { name: 'Second Legal Seller', companyCode: '987654321' } }]);
  });

  it('writes all package subjects and its sales invoice link together', async () => {
    await addPackage();
    const invoice = await issue('package', id(6));
    expect(await issue('package', id(6))).toBe(invoice);
    expect((await db.query('SELECT total_price, session_ids FROM invoice_line_items ORDER BY total_price')).rows)
      .toEqual([{ total_price: '29', session_ids: [id(6), id(4)] }, { total_price: '31', session_ids: [id(6), id(4)] }]);
    expect((await db.query('SELECT manual_sales_invoice_id FROM lesson_packages')).rows).toEqual([{ manual_sales_invoice_id: invoice }]);
    expect(await issue()).toBeNull();
  });

  it('shares a trial invoice between a session payment and the linked one-lesson package', async () => {
    await addPackage(1);
    const invoice = await issue();
    expect(await issue('package', id(6))).toBe(invoice);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 1 }]);
  });

  it('uses the verified amount if package item prices changed after checkout', async () => {
    await addPackage();
    await db.exec('UPDATE lesson_package_items SET total_price = 100');
    await issue('package', id(6));
    expect((await db.query('SELECT total_amount FROM invoices')).rows).toEqual([{ total_amount: '60.00' }]);
    expect((await db.query('SELECT total_price FROM invoice_line_items')).rows).toEqual([{ total_price: '60.00' }]);
  });

  it('rolls back invoice, package link and number when a line fails, then permits a retry', async () => {
    await addPackage();
    await db.exec('ALTER TABLE invoice_line_items ADD CONSTRAINT simulated_failure CHECK (total_price < 0)');
    await expect(issue('package', id(6))).rejects.toThrow(/simulated_failure/);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 0 }]);
    expect((await db.query('SELECT manual_sales_invoice_id FROM lesson_packages')).rows).toEqual([{ manual_sales_invoice_id: null }]);
    expect((await db.query('SELECT next_invoice_number FROM invoice_profiles')).rows).toEqual([{ next_invoice_number: 20 }]);
    await db.exec('ALTER TABLE invoice_line_items DROP CONSTRAINT simulated_failure');
    expect(await issue('package', id(6))).toBeTruthy();
  });

  it.each(['unpaid', 'complimentary', 'school', 'solo'])('keeps a %s lesson out of this sales flow', async kind => {
    if (kind === 'unpaid') await db.exec('UPDATE sessions SET paid = false');
    if (kind === 'complimentary') await db.exec('UPDATE sessions SET is_complimentary = true');
    if (kind === 'school') await db.exec("UPDATE organizations SET entity_type = 'school'");
    if (kind === 'solo') await db.exec('UPDATE profiles SET organization_id = NULL');
    expect(await issue()).toBeNull();
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 0 }]);
  });

  it('keeps cancelled packages and packages belonging to another student unchanged', async () => {
    await addPackage(1);
    await db.exec("UPDATE lesson_packages SET payment_status = 'cancelled'");
    expect(await issue('package', id(6))).toBeNull();
    expect(await issue()).toBeNull();
    await db.exec(`UPDATE lesson_packages SET payment_status = 'paid', student_id = '${id(99)}'`);
    await expect(issue()).rejects.toThrow(/different student/);
  });

  it.each(['missing', 'incomplete'])('requires the organization profile when it is %s, even if the tutor has a personal profile', async kind => {
    if (kind === 'missing') await db.exec('DELETE FROM invoice_profiles');
    else await db.exec('UPDATE invoice_profiles SET address = NULL');
    await db.exec(`INSERT INTO invoice_profiles(id, user_id, entity_type, activity_number, contact_email, invoice_series, next_invoice_number)
      VALUES ('${id(15)}', '${id(1)}', 'individual', 'IV-123', 'personal@example.test', 'PERSONAL', 1)`);
    await expect(issue()).rejects.toMatchObject({ code: 'PT422', message: 'INVOICE_PROFILE_INCOMPLETE' });
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 0 }]);
  });

  it('preserves personal seller invoices for solo prepaid packages', async () => {
    await addPackage();
    await db.exec(`UPDATE profiles SET organization_id = NULL;
      UPDATE platform_fee_ledger SET organization_id = NULL;
      UPDATE invoice_profiles SET organization_id = NULL, user_id = '${id(1)}', entity_type = 'individual', activity_number = 'IV-123'`);
    await issue('package', id(6));
    expect((await db.query<any>('SELECT organization_id, seller_user_id, seller_snapshot FROM invoices')).rows[0])
      .toMatchObject({ organization_id: null, seller_user_id: id(1), seller_snapshot: { name: 'Test Tutor', activityNumber: 'IV-123' } });
  });

  it('stores PLN as PLN and rejects payment evidence in a different currency', async () => {
    await db.exec("UPDATE platform_fee_ledger SET currency = 'PLN'");
    await expect(issue()).rejects.toThrow(/evidence/);
    await issue('session', id(4), 'cs_paid', 99, 'PLN');
    expect((await db.query<any>('SELECT total_amount, pdf_meta, seller_snapshot FROM invoices')).rows[0])
      .toMatchObject({ total_amount: '29.00', pdf_meta: { currency: 'PLN' } });
  });

  it.each(['checkout', 'organization'])('rejects a mismatched payment %s', async kind => {
    if (kind === 'organization') await db.exec(`UPDATE platform_fee_ledger SET organization_id = '${id(99)}'`);
    await expect(issue('session', id(4), kind === 'checkout' ? 'cs_other' : 'cs_paid')).rejects.toThrow(/evidence/);
    expect((await db.query('SELECT count(*)::int AS count FROM invoices')).rows).toEqual([{ count: 0 }]);
  });

  it('supports zero-fee checkouts with verified evidence and no fee-ledger row', async () => {
    await db.exec('DELETE FROM platform_fee_ledger');
    expect(await issue('session', id(4), null, 29)).toBeNull();
    expect(await issue('session', id(4), 'cs_zero_fee', 27)).toBeTruthy();
    expect((await db.query('SELECT total_amount FROM invoices')).rows).toEqual([{ total_amount: '27.00' }]);
  });

  it('reuses existing customer invoices without marking a partial combined invoice fully paid', async () => {
    await db.exec(`INSERT INTO invoices(id, invoice_number, organization_id, seller_snapshot, status, total_amount)
      VALUES ('${id(8)}', 'EXISTING-001', '${org}', '{"companyCode":"123456789"}', 'issued', 100);
      INSERT INTO invoice_line_items(invoice_id, session_ids) VALUES ('${id(8)}', ARRAY['${id(4)}'::uuid]);`);
    expect(await issue()).toBe(id(8));
    expect((await db.query('SELECT status FROM invoices')).rows).toEqual([{ status: 'issued' }]);
    await db.exec('UPDATE invoices SET total_amount = 29');
    expect(await issue()).toBe(id(8));
    expect((await db.query('SELECT status FROM invoices')).rows).toEqual([{ status: 'paid' }]);
  });

  it.each(['tutor_pay', 'other tenant'])('never reuses or marks a %s invoice paid', async kind => {
    await db.exec(`INSERT INTO invoices(id, invoice_number, organization_id, seller_snapshot, status, total_amount, pdf_meta)
      VALUES ('${id(8)}', 'PRIVATE-001', '${kind === 'other tenant' ? id(99) : org}', '{"companyCode":"123456789"}', 'issued', 20,
        '${kind === 'tutor_pay' ? '{"invoiceKind":"tutor_pay"}' : '{}'}');
      INSERT INTO invoice_line_items(invoice_id, session_ids) VALUES ('${id(8)}', ARRAY['${id(4)}'::uuid]);`);
    expect(await issue()).not.toBe(id(8));
    expect((await db.query('SELECT status FROM invoices WHERE id = $1', [id(8)])).rows).toEqual([{ status: 'issued' }]);
  });

  it('uses the education layout only when that organization enables it', async () => {
    await db.exec("UPDATE organizations SET features = '{\"pvm_education_invoice\":true}'");
    await issue();
    const { rows } = await db.query<any>('SELECT seller_snapshot, pdf_meta FROM invoices');
    expect(rows[0]).toMatchObject({ seller_snapshot: { name: 'Other Organization Legal Seller',
      taxExemptionNote: 'PVM neapmokestinama pagal LR PVMĮ 22 str.' }, pdf_meta: { layout: 'pvm_education' } });
    expect(JSON.stringify(rows[0])).not.toContain('Pro Klasė');
  });

  it('preserves the Pro Klasė seller exemption without giving it to other organizations', async () => {
    const pro = 'b0a00000-7e57-4000-8000-000000000001';
    await db.exec(`UPDATE organizations SET id = '${pro}'; UPDATE profiles SET organization_id = '${pro}';
      UPDATE invoice_profiles SET organization_id = '${pro}'; UPDATE platform_fee_ledger SET organization_id = '${pro}'`);
    await issue();
    expect((await db.query<any>('SELECT seller_snapshot FROM invoices')).rows[0].seller_snapshot)
      .toHaveProperty('taxExemptionNote', 'PVM neapmokestinama pagal LR PVMĮ 22 str.');
  });

  it('keeps the operation inaccessible to browser roles', async () => {
    const signature = 'public.issue_paid_source_sales_invoice(text,uuid,text,numeric,text)';
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect((await db.query('SELECT has_function_privilege($1, $2, $3) AS allowed', [role, signature, 'execute'])).rows)
        .toEqual([{ allowed: role === 'service_role' }]);
    }
  });
});
