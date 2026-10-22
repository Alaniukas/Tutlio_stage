// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), otherOrg = id(2), child = id(3), otherChild = id(4), charge = id(5), template = id(6);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE organizations(id uuid PRIMARY KEY,entity_type text,features jsonb DEFAULT '{}');
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations);
    CREATE TABLE school_monthly_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_number text NOT NULL,
      organization_id uuid,student_id uuid,payer_student_ids uuid[],contract_id uuid,period_start date,period_end date,
      unit_price_eur numeric,base_lessons int,base_amount_eur numeric,extra_lessons int,extra_amount_eur numeric,
      subtotal_eur numeric,discount_amount_eur numeric,discount_note text,total_eur numeric,credit_preview_eur numeric,
      credit_applied_eur numeric DEFAULT 0,extra_session_ids uuid[],billing_model text,billed_session_ids uuid[],
      payment_status text,due_date date,stripe_checkout_session_id text,invoice_email_sent_at timestamptz,issuer_note text);
    CREATE TABLE school_monthly_invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid REFERENCES school_monthly_invoices,
      sort_order int,description text NOT NULL,unit_price_eur numeric,quantity numeric CHECK(quantity>0),original_amount_eur numeric,
      discount_type text,discount_value numeric,discount_amount_eur numeric,discount_note text,amount_eur numeric,
      source text CONSTRAINT school_monthly_invoice_lines_source_check CHECK(source IN ('lesson','discount')),
      consultation_id uuid,session_id uuid,session_ids uuid[]);
  `);
  await db.exec(readFileSync('supabase/migrations/20261021093055_school_one_off_services.sql', 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`BEGIN;
    INSERT INTO organizations(id,entity_type) VALUES('${org}','school'),('${otherOrg}','school');
    INSERT INTO students VALUES('${child}','${org}'),('${otherChild}','${otherOrg}');
    INSERT INTO school_service_templates(id,organization_id,name,unit_price_eur) VALUES('${template}','${org}','Licencija',7);
    INSERT INTO school_student_service_charges(id,organization_id,student_id,template_id,description,unit_price_eur,quantity,service_date,invoice_month,internal_note)
      VALUES('${charge}','${org}','${child}','${template}','Licencija',7,2,'2026-10-21','2026-10-01','Admin only');
  `);
});
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE'); });
afterAll(async () => { await db?.close(); });

const invoice = () => ({ organization_id: org, student_id: child, payer_student_ids: [child], invoice_number: 'S-NEW',
  period_start: '2026-10-01', period_end: '2026-10-31', subtotal_eur: 14, discount_amount_eur: 0, total_eur: 14,
  credit_preview_eur: 0, billed_session_ids: [], due_date: '2026-11-06' });
const lines = () => [{ source: 'service', description: 'Licencija', unit_price_eur: 7, quantity: 2,
  original_amount_eur: 14, amount_eur: 14, discount_amount_eur: 0, session_ids: [],
  service_charge_id: charge, service_charge_version: 1, service_date: '2026-10-21' }];
async function issue(previous: any[] = [], next = invoice(), rows: any[] = lines()) {
  return (await db.query<{ value: any }>('SELECT issue_school_service_invoice($1,$2,$3,$4) AS value',
    [org, JSON.stringify(previous), JSON.stringify(next), JSON.stringify(rows)])).rows[0].value;
}
async function snapshot(invoiceId: string) {
  return (await db.query<any>('SELECT to_jsonb(i) AS value FROM school_monthly_invoices i WHERE id=$1', [invoiceId])).rows[0].value;
}
async function rejects(run: () => Promise<unknown>, reason: string) {
  await db.exec('SAVEPOINT rejection');
  await expect(run()).rejects.toThrow(reason);
  await db.exec('ROLLBACK TO SAVEPOINT rejection');
}

describe('one-off school services: atomic invoices and private administration', () => {
  it('issues an invoice without sessions or a contract and claims each charge once', async () => {
    const result = await issue();
    expect(result).toMatchObject({ contract_id: null, total_eur: 14, billed_session_ids: [] });
    expect((await db.query<any>('SELECT invoice_id FROM school_student_service_charges WHERE id=$1', [charge])).rows[0].invoice_id).toBe(result.id);
    await rejects(() => issue(), 'already invoiced');
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_monthly_invoices')).rows[0].n).toBe(1);
  });
  it('rejects stale prices/versions and rolls back the complete invoice', async () => {
    await db.query('UPDATE school_student_service_charges SET unit_price_eur=9 WHERE id=$1', [charge]);
    await rejects(() => issue(), 'Service changed');
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_monthly_invoices')).rows[0].n).toBe(0);
  });
  it('preserves the billed snapshot and prevents edits or deletion after issue', async () => {
    const invoice = await issue();
    await rejects(() => db.query('UPDATE school_monthly_invoices SET total_eur=1 WHERE id=$1', [invoice.id]), 'amounts and sources cannot be changed');
    await rejects(() => db.query('UPDATE school_student_service_charges SET description=$1 WHERE id=$2', ['Changed', charge]), 'already invoiced');
    await rejects(() => db.query('DELETE FROM school_student_service_charges WHERE id=$1', [charge]), 'cannot be deleted');
    await rejects(() => db.query('UPDATE school_monthly_invoice_lines SET amount_eur=1 WHERE service_charge_id=$1', [charge]), 'history cannot be changed');
    await rejects(() => db.query('DELETE FROM school_monthly_invoice_lines WHERE service_charge_id=$1', [charge]), 'history cannot be changed');
    await db.query('UPDATE school_service_templates SET unit_price_eur=15 WHERE id=$1', [template]);
    expect((await db.query<any>('SELECT unit_price_eur FROM school_student_service_charges WHERE id=$1', [charge])).rows[0].unit_price_eur).toBe('7.00');
  });
  it('releases a cancelled invoice for reissue while retaining the old invoice and lines', async () => {
    const first = await issue();
    await db.query("UPDATE school_monthly_invoices SET payment_status='cancelled' WHERE id=$1", [first.id]);
    const second = await issue();
    expect(second.id).not.toBe(first.id);
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_monthly_invoice_lines WHERE service_charge_id=$1', [charge])).rows[0].n).toBe(2);
    await rejects(() => db.query("UPDATE school_monthly_invoices SET payment_status='pending' WHERE id=$1", [first.id]), 'must be reissued');
  });
  it('atomically regenerates unsent drafts and restores the old claim if regeneration fails', async () => {
    const first = await issue();
    await rejects(async () => issue([await snapshot(first.id)], invoice(), [{ ...lines()[0], service_charge_version: 99 }]), 'Service changed');
    expect((await snapshot(first.id)).payment_status).toBe('pending');
    const second = await issue([await snapshot(first.id)]);
    expect((await snapshot(first.id)).payment_status).toBe('cancelled');
    expect((await db.query<any>('SELECT invoice_id FROM school_student_service_charges WHERE id=$1', [charge])).rows[0].invoice_id).toBe(second.id);
  });
  it('does not regenerate emailed, paid, or checked out invoices', async () => {
    const first = await issue();
    await db.query('UPDATE school_monthly_invoices SET invoice_email_sent_at=now() WHERE id=$1', [first.id]);
    await rejects(async () => issue([await snapshot(first.id)]), 'cannot be regenerated');
  });
  it('rejects other organizations, cancelled charges, altered totals and inherited discounts', async () => {
    await rejects(() => db.query('UPDATE school_student_service_charges SET template_id=NULL,student_id=$1 WHERE id=$2', [otherChild, charge]), 'Service belongs to another');
    await rejects(() => issue([], { ...invoice(), payer_student_ids: [otherChild] }), 'Invalid invoice students');
    await rejects(() => issue([], { ...invoice(), total_eur: 1 }), 'total differs');
    await rejects(() => issue([], invoice(), [{ ...lines()[0], discount_amount_eur: 1 }]), 'Service changed');
    await db.query('UPDATE school_student_service_charges SET cancelled_at=now() WHERE id=$1', [charge]);
    await rejects(() => issue(), 'already invoiced');
  });
  it('keeps the new tables, internal notes and writer inaccessible to browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      const access = (await db.query<any>(`SELECT has_table_privilege($1,'school_student_service_charges','SELECT') AS read,
        has_table_privilege($1,'school_service_templates','UPDATE') AS edit,
        has_function_privilege($1,'issue_school_service_invoice(uuid,jsonb,jsonb,jsonb)','EXECUTE') AS issue`, [role])).rows[0];
      expect(access).toEqual({ read: false, edit: false, issue: false });
    }
    expect((await db.query<any>("SELECT relrowsecurity FROM pg_class WHERE relname IN ('school_student_service_charges','school_service_templates')")).rows.every(row => row.relrowsecurity)).toBe(true);
  });
});
