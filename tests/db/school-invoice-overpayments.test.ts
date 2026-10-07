// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org = id(1), outsideOrg = id(2), child = id(11), sibling = id(12), otherChild = id(13), admin = id(21), source = id(31);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    GRANT USAGE ON SCHEMA auth,private TO authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,payer_email text);
    CREATE TABLE organization_admins(user_id uuid,organization_id uuid,status text,role text,permissions jsonb);
    CREATE FUNCTION private.org_admin_role_grants_permission(p_role text,p_permission text) RETURNS boolean
      LANGUAGE sql AS $$ SELECT p_role IN ('owner','admin','accountant') $$;
    CREATE FUNCTION private.org_admin_permission_gate(p_required text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM organization_admins WHERE user_id=auth.uid() AND status='active'
        AND (role='owner' OR permissions @> '{"finance.view":true}'::jsonb)) $$;
    CREATE FUNCTION is_school_admin(p_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM organization_admins WHERE user_id=auth.uid() AND organization_id=p_org AND status='active') $$;
    CREATE TABLE school_monthly_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations,
      student_id uuid REFERENCES students,period_start date,period_end date,total_eur numeric(10,2),
      payment_status text DEFAULT 'pending',paid_at timestamptz,paid_via text);
  `);
  await db.exec(readFileSync('supabase/migrations/20261007093928_school_invoice_overpayment_carry_forward.sql','utf8'));
}, 30_000);
beforeEach(async () => {
  await db.exec(`BEGIN;
    INSERT INTO auth.users VALUES('${admin}'),('${id(22)}');
    INSERT INTO organizations VALUES('${org}'),('${outsideOrg}');
    INSERT INTO organization_admins VALUES('${admin}','${org}','active','owner','{}'),('${id(22)}','${outsideOrg}','active','owner','{}');
    INSERT INTO students VALUES('${child}','${org}','parent@example.test'),('${sibling}','${org}','parent@example.test'),('${otherChild}','${org}','other@example.test');
    INSERT INTO school_monthly_invoices(id,organization_id,student_id,period_start,period_end,total_eur,payment_status,paid_via)
      VALUES('${source}','${org}','${child}','2026-09-01','2026-09-30',96,'paid','stripe');
  `);
});
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE'); });
afterAll(async () => { await db?.close(); });

async function register(amount=12, request=id(41), actor=admin, sourceId=source) {
  return (await db.query<{id:string}>('SELECT register_school_invoice_overpayment($1,$2,$3,$4,$5,$6) AS id',
    [org,sourceId,amount,'Wrong Monday lessons',request,actor])).rows[0].id;
}
async function invoice(n:number,total:number,month='10', extra='') {
  return (await db.query<any>(`INSERT INTO school_monthly_invoices(id,organization_id,student_id,period_start,period_end,total_eur ${extra ? ',payer_student_ids' : ''})
    VALUES($1,$2,$3,$4,$5,$6 ${extra ? ','+extra : ''}) RETURNING *`,
    [id(n),org,child,`2026-${month}-01`,`2026-${month}-28`,total])).rows[0];
}
async function rejected(action:()=>Promise<unknown>, message:string) {
  await db.exec('SAVEPOINT reject_test');
  await expect(action()).rejects.toThrow(message);
  await db.exec('ROLLBACK TO SAVEPOINT reject_test');
}
async function balance() {
  const result = await db.query<any>(`SELECT c.amount_eur-coalesce(sum(u.amount_eur) FILTER(WHERE u.released_at IS NULL),0) AS remaining
    FROM school_invoice_overpayments c LEFT JOIN school_invoice_overpayment_uses u ON u.overpayment_id=c.id GROUP BY c.id`);
  return Number(result.rows[0]?.remaining);
}

describe('school invoice overpayment transactions', () => {
  it('records a 12 euro adjustment, keeps PAM-800 paid at 96, and charges 72 on the next 84 euro bill', async () => {
    const credit = await register();
    expect(await register()).toBe(credit); // Ambiguous HTTP retries reuse the operation.
    const next = await invoice(51,84);
    expect(Number(next.credit_applied_eur)).toBe(12);
    expect(Number(next.total_eur)-Number(next.credit_applied_eur)).toBe(72);
    expect(await balance()).toBe(0);
    const original = (await db.query<any>('SELECT * FROM school_monthly_invoices WHERE id=$1',[source])).rows[0];
    expect(original).toMatchObject({ payment_status:'paid',paid_via:'stripe',total_eur:'96.00' });
    expect((await db.query<any>('SELECT * FROM school_invoice_overpayments')).rows[0]).toMatchObject({ reason:'Wrong Monday lessons',created_by:admin,source_invoice_id:source });
    await rejected(()=>db.query('UPDATE school_monthly_invoices SET total_eur=84 WHERE id=$1',[source]),'keisti negalima');
    expect(Number((await invoice(52,84,'11')).credit_applied_eur)).toBe(0);
  });
  it('splits a balance over months and marks a fully covered invoice as paid with credit', async () => {
    await register();
    const next = await invoice(51,10);
    expect(next).toMatchObject({ payment_status:'paid',paid_via:'credit',credit_applied_eur:'10.00' });
    await rejected(()=>db.query("UPDATE school_monthly_invoices SET payment_status='pending' WHERE id=$1",[id(51)]),'būsenos keisti negalima');
    expect(await balance()).toBe(2);
    expect(Number((await invoice(52,84,'11')).credit_applied_eur)).toBe(2);
    expect(await balance()).toBe(0);
  });
  it('releases an unpaid cancelled invoice allocation and preserves the old allocation audit', async () => {
    await register(); await invoice(51,84);
    await db.query("UPDATE school_monthly_invoices SET payment_status='cancelled' WHERE id=$1",[id(51)]);
    expect(await balance()).toBe(12);
    expect((await db.query<any>('SELECT released_at FROM school_invoice_overpayment_uses')).rows[0].released_at).toBeTruthy();
    expect(Number((await invoice(52,84)).credit_applied_eur)).toBe(12);
    await rejected(()=>db.query("UPDATE school_monthly_invoices SET payment_status='pending' WHERE id=$1",[id(51)]),'išrašyti iš naujo');
  });
  it('rolls back reservations when the preview balance changed or a later insert constraint fails', async () => {
    await register();
    await rejected(()=>db.query(`INSERT INTO school_monthly_invoices(id,organization_id,student_id,period_start,period_end,total_eur,credit_preview_eur)
      VALUES($1,$2,$3,'2026-10-01','2026-10-31',84,0)`,[id(51),org,child]),'likutis pasikeitė');
    expect(await balance()).toBe(12);
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_invoice_overpayment_uses')).rows[0].n).toBe(0);
    await rejected(()=>invoice(31,84),'duplicate key');
    expect(await balance()).toBe(12);
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_invoice_overpayment_uses')).rows[0].n).toBe(0);
  });
  it('does not apply credit to the same month, another child alone, or a changed payer', async () => {
    await register();
    expect(Number((await invoice(51,20,'09')).credit_applied_eur)).toBe(0);
    await db.query(`INSERT INTO school_monthly_invoices(organization_id,student_id,period_start,period_end,total_eur)
      VALUES($1,$2,'2026-10-01','2026-10-31',20)`,[org,otherChild]);
    expect(await balance()).toBe(12);
    await db.query('UPDATE students SET payer_email=$1 WHERE id=$2',['newpayer@example.test',child]);
    expect(Number((await invoice(52,84)).credit_applied_eur)).toBe(0);
  });
  it('allows the family invoice to use the credited child’s balance and rejects unrelated recipients', async () => {
    await register();
    await rejected(()=>invoice(51,84,'10',`ARRAY['${child}','${otherChild}']::uuid[]`),'Invalid payer students');
    const next = (await db.query<any>(`INSERT INTO school_monthly_invoices(organization_id,student_id,payer_student_ids,period_start,period_end,total_eur)
      VALUES($1,$2,$3,'2026-10-01','2026-10-31',84) RETURNING *`,[org,sibling,[child,sibling]])).rows[0];
    expect(Number(next.credit_applied_eur)).toBe(12);
  });
  it('rejects unpaid, excessive, duplicate or unauthorized registrations', async () => {
    await rejected(()=>register(97),'negali viršyti');
    await rejected(()=>register(12,id(41),id(22)),'Forbidden');
    await db.query("UPDATE school_monthly_invoices SET payment_status='pending' WHERE id=$1",[source]);
    await rejected(()=>register(),'negali viršyti');
    await db.query("UPDATE school_monthly_invoices SET payment_status='paid' WHERE id=$1",[source]);
    await register();
    await rejected(()=>register(12,id(42)),'jau užregistruota');
  });
  it('voids unused credit with a reason but refuses to void spent credit or edit allocations', async () => {
    const credit = await register();
    await db.query('SELECT void_school_invoice_overpayment($1,$2,$3,$4)',[org,credit,'Wrong amount entered',admin]);
    expect(Number((await invoice(51,84)).credit_applied_eur)).toBe(0);
    const replacement = await register(12,id(42)); await invoice(52,84,'11');
    await rejected(()=>db.query('SELECT void_school_invoice_overpayment($1,$2,$3,$4)',[org,replacement,'Wrong amount entered',admin]),'Panaudotos');
    await rejected(()=>db.query('UPDATE school_monthly_invoices SET credit_applied_eur=0 WHERE id=$1',[id(52)]),'keisti negalima');
  });
  it('exposes ledger reads only to the school admin and denies client writes and RPC execution', async () => {
    await register();
    await db.query("SELECT set_config('test.uid',$1,false)",[admin]); await db.exec('SET ROLE authenticated');
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_invoice_overpayments')).rows[0].n).toBe(1);
    await rejected(()=>register(),'permission denied');
    await rejected(()=>db.exec('DELETE FROM school_invoice_overpayments'),'permission denied');
    await db.exec('RESET ROLE'); await db.query("SELECT set_config('test.uid',$1,false)",[id(22)]); await db.exec('SET ROLE authenticated');
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_invoice_overpayments')).rows[0].n).toBe(0);
    expect((await db.query<any>('SELECT count(*)::int AS n FROM school_invoice_overpayment_uses')).rows[0].n).toBe(0);
  });
});
