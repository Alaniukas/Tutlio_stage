// npm install --prefix tmp/proklase-sql --no-save --package-lock=false @electric-sql/pglite@0.3.14
// node scripts/test-proklase-trial-invoice-sql.mjs
import { PGlite } from '../tmp/proklase-sql/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE subjects(id uuid PRIMARY KEY, name text, is_trial boolean);
CREATE TABLE sessions(id uuid PRIMARY KEY, tutor_id uuid, subject_id uuid, paid boolean, price numeric, lesson_package_id uuid, start_time timestamptz);
CREATE TABLE lesson_packages(id uuid PRIMARY KEY, tutor_id uuid, subject_id uuid, paid boolean, total_price numeric, manual_sales_invoice_id uuid);
CREATE TABLE invoice_profiles(id uuid PRIMARY KEY, organization_id uuid, invoice_series text, next_invoice_number int, updated_at timestamptz);
CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text, issued_by_user_id uuid, organization_id uuid,
 seller_snapshot jsonb, buyer_snapshot jsonb, issue_date date, period_start date, period_end date, grouping_type text, subtotal numeric, total_amount numeric, status text);
CREATE TABLE invoice_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid REFERENCES invoices(id), description text, quantity numeric, unit_price numeric, total_price numeric, session_ids uuid[]);
`);
const numbering = readFileSync('supabase/migrations/20260820120000_pvm_invoice_numbering.sql', 'utf8');
await db.exec(numbering.slice(numbering.indexOf('CREATE OR REPLACE FUNCTION public.allocate_invoice_number'), numbering.indexOf('COMMENT ON FUNCTION')));
await db.exec(readFileSync('supabase/migrations/20260907215717_proklase_paid_trial_invoice.sql', 'utf8'));
await db.exec('ALTER TABLE invoices ADD COLUMN created_at timestamptz DEFAULT now()');
await db.exec(readFileSync('supabase/migrations/20260907215738_payment_invoice_query_indexes.sql', 'utf8'));
const tutor = '00000000-0000-4000-8000-000000000001';
const subject = '00000000-0000-4000-8000-000000000002';
const lesson = '00000000-0000-4000-8000-000000000003';
await db.exec(`INSERT INTO profiles VALUES ('${tutor}', 'b0a00000-7e57-4000-8000-000000000001');
INSERT INTO subjects VALUES ('${subject}', 'Bandomoji matematika', true);
INSERT INTO sessions VALUES ('${lesson}', '${tutor}', '${subject}', true, 15, null, '2026-09-07T12:00:00Z');
INSERT INTO invoice_profiles VALUES ('${tutor}', 'b0a00000-7e57-4000-8000-000000000001', 'PK', 1, now());`);
const issue = () => db.query('select issue_paid_trial_invoice($1, $2, $3) as id', [lesson, { name: 'Pro klasė', companyCode: '123' }, { name: 'Mama' }]);
const results = await Promise.all([issue(), issue(), issue()]);
assert.equal(new Set(results.map((r) => r.rows[0].id)).size, 1);
assert.deepEqual((await db.query('select invoice_number, total_amount::text, status from invoices')).rows,
  [{ invoice_number: 'PK-001', total_amount: '15', status: 'paid' }]);
assert.equal((await db.query('select count(*)::int as n from invoice_line_items')).rows[0].n, 1);
assert.equal((await db.query('select next_invoice_number from invoice_profiles')).rows[0].next_invoice_number, 2);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(issue(), /permission denied/);
  await db.exec('RESET ROLE');
}
await db.exec(`UPDATE sessions SET paid = false WHERE id = '${lesson}'`);
assert.equal((await issue()).rows[0].id, null);
await db.exec(`UPDATE sessions SET paid = true, lesson_package_id = '${tutor}' WHERE id = '${lesson}'`);
assert.equal((await issue()).rows[0].id, null);
await db.exec(`UPDATE sessions SET lesson_package_id = null WHERE id = '${lesson}'; UPDATE profiles SET organization_id = '${tutor}'`);
assert.equal((await issue()).rows[0].id, null);
console.log('PASS: SQL migration executes; repeated issuance creates one numbered invoice and line; unpaid/package/other-org lessons excluded; public roles denied.');
await db.exec(`UPDATE profiles SET organization_id = 'b0a00000-7e57-4000-8000-000000000001';
INSERT INTO lesson_packages VALUES ('${tutor}', '${tutor}', '${subject}', true, 15.48, null);`);
const issuePackage = () => db.query('select issue_paid_trial_package_invoice($1, $2, $3) as id', [tutor, { name: 'Pro klasė' }, { name: 'Mama' }]);
const packages = await Promise.all([issuePackage(), issuePackage()]);
assert.equal(packages[0].rows[0].id, packages[1].rows[0].id);
assert.equal((await db.query('select count(*)::int as n from invoices')).rows[0].n, 2);
assert.equal((await db.query('select next_invoice_number from invoice_profiles')).rows[0].next_invoice_number, 3);
assert.equal((await db.query('select total_amount::text from invoices where id = $1', [packages[0].rows[0].id])).rows[0].total_amount, '15.48');
console.log('PASS: paid trial package invoice is linked atomically and uses the recorded paid total; retries reuse the invoice.');
await db.exec('SET enable_seqscan = off');
const packagePlan = await db.query('EXPLAIN SELECT id FROM sessions WHERE lesson_package_id = $1', [tutor]);
assert.match(JSON.stringify(packagePlan.rows), /idx_sessions_lesson_package/);
const invoicePlan = await db.query('EXPLAIN SELECT id FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1000', ['b0a00000-7e57-4000-8000-000000000001']);
assert.match(JSON.stringify(invoicePlan.rows), /idx_invoices_org_created_id/);
console.log('PASS: payment package and ordered invoice queries can use the new indexes.');
await db.close();
