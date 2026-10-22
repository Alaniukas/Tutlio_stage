// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const org = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const tutor = '6eb7acb1-2358-45e8-996c-e66c8647f731';
const approver = '0128fe57-a29d-4bf1-b4f6-63107e72bd8f';
const lessonAudit = 'e618f8bb-6745-4285-bf6b-89871f8f233f';
const action = 'record_yohan_september_2026_compensations';
const sql = readFileSync('scripts/sql/record-yohan-september-2026-compensations.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sources = [
  ['e8b08e80-150d-441b-97d8-9d4a4d5a2b65', 'PAM-816', 24, 'paid', '2026-09-07'],
  ['fab97a55-fab0-4ad8-b50a-3dff442f4550', 'PAM-821', 24, 'paid', '2026-09-07'],
  ['eb272135-f777-41bc-b1d3-9e497f69eac7', 'PAM-828', 236, 'pending', '2026-09-09'],
  ['2b148931-96c9-4294-9af8-c31dbd954d26', 'PAM-835', 18, 'paid', '2026-09-09'],
  ['0302b173-58b5-430f-9ee0-b322032292a1', 'PAM-843', 120, 'paid', '2026-09-07'],
  ['88e66614-ac15-4f43-bf8d-853d141acb28', 'PAM-844', 104, 'pending', '2026-09-09'],
  ['00dfdaae-02cb-4b41-ad85-aec8b5235a8a', 'PAM-855', 108, 'paid', '2026-09-09'],
  ['c52b6a65-0aab-4676-8348-1607e8d82e44', 'PAM-861', 172, 'paid', '2026-09-09'],
] as const;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,payer_email text);
    CREATE TABLE organization_admins(user_id uuid,organization_id uuid,status text,role text,permissions jsonb);
    CREATE FUNCTION private.org_admin_role_grants_permission(text,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE FUNCTION private.org_admin_permission_gate(text[]) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE FUNCTION is_school_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE TABLE school_monthly_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations,
      student_id uuid REFERENCES students,invoice_number text,period_start date,period_end date,total_eur numeric(10,2),
      payment_status text DEFAULT 'pending',paid_at timestamptz,paid_via text,invoice_email_sent_at timestamptz);
    CREATE TABLE school_monthly_invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid,
      unit_price_eur numeric,quantity integer,amount_eur numeric,session_ids uuid[]);
    CREATE TABLE sessions(id uuid PRIMARY KEY,tutor_id uuid,student_id uuid,start_time timestamptz,status text);
    CREATE TABLE student_admin_notes(student_id uuid PRIMARY KEY REFERENCES students,admin_comment text,
      last_contacted_at date,updated_at timestamptz DEFAULT now());
    CREATE TABLE platform_admin_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,
      action text,details jsonb,created_at timestamptz DEFAULT now());
  `);
  await db.exec(readFileSync('supabase/migrations/20261007093928_school_invoice_overpayment_carry_forward.sql', 'utf8'));
}, 30_000);

beforeEach(async () => {
  await db.exec(`BEGIN; INSERT INTO auth.users VALUES('${approver}'); INSERT INTO organizations VALUES('${org}');
    INSERT INTO organization_admins VALUES('${approver}','${org}','active','owner','{}');`);
  const manifest: object[] = [];
  for (let index = 0; index < sources.length; index++) {
    const [invoice, number, total, status, date] = sources[index];
    const child = id(100 + index), session = id(200 + index);
    await db.query('INSERT INTO students VALUES($1,$2,$3)', [child, org, `child${index}@example.test`]);
    await db.query('INSERT INTO sessions VALUES($1,$2,$3,$4,$5)', [session, tutor, child, `${date}T09:00:00Z`, 'cancelled']);
    await db.query(`INSERT INTO school_monthly_invoices(id,organization_id,student_id,invoice_number,period_start,period_end,total_eur,payment_status,paid_via,invoice_email_sent_at)
      VALUES($1,$2,$3,$4,'2026-09-01','2026-09-30',$5,$6,$7,'2026-10-07T12:00:00Z')`,
    [invoice, org, child, number, total, status, status === 'paid' ? 'stripe' : null]);
    await db.query(`INSERT INTO school_monthly_invoice_lines(invoice_id,unit_price_eur,quantity,amount_eur,session_ids)
      VALUES($1,6,3,18,$2)`, [invoice, [session]]);
    manifest.push({ invoice_id: invoice, invoice_number: number, total_eur: total,
      payment_status: status, affected_session_ids: [session] });
  }
  await db.query('INSERT INTO platform_admin_audit(id,organization_id,action,details) VALUES($1,$2,$3,$4)',
    [lessonAudit, org, 'correct_yohan_september_2026_lessons', JSON.stringify({ related_student_invoices: manifest })]);
  await db.query(`INSERT INTO student_admin_notes(student_id,admin_comment,last_contacted_at)
    VALUES($1,'Existing private note','2026-10-10')`, [id(106)]);
});
afterEach(async () => { await db.exec('ROLLBACK;'); });
afterAll(async () => { await db?.close(); });

async function invoiceSnapshot() {
  return (await db.query('SELECT * FROM school_monthly_invoices ORDER BY id')).rows;
}
async function nextInvoice(child: string, month: number, total: number) {
  return (await db.query<any>(`INSERT INTO school_monthly_invoices(organization_id,student_id,period_start,period_end,total_eur)
    VALUES($1,$2,$3,$4,$5) RETURNING *`, [org, child, `2026-${month}-01`, `2026-${month}-28`, total])).rows[0];
}
async function rejected(query: string, message: string) {
  await db.exec('SAVEPOINT reject_correction');
  await expect(db.exec(query)).rejects.toThrow(message);
  await db.exec('ROLLBACK TO SAVEPOINT reject_correction');
}

describe('approved Yohan September one-time billing compensation', () => {
  it('records 8 x EUR 6 without altering the six paid and two pending source invoices or private notes', async () => {
    const before = await invoiceSnapshot();
    await db.exec(sql);
    expect(await invoiceSnapshot()).toEqual(before);
    const credits = (await db.query<any>('SELECT * FROM school_invoice_overpayments')).rows;
    expect(credits).toHaveLength(8);
    expect(credits.reduce((sum, row) => sum + Number(row.amount_eur), 0)).toBe(48);
    expect(credits.every(row => row.created_by === approver)).toBe(true);
    const note = (await db.query<any>('SELECT * FROM student_admin_notes WHERE student_id=$1', [id(106)])).rows[0];
    expect(note.admin_comment).toContain('Existing private note\n\n[YOHAN-2026-09 PAM-855]');
    expect(new Date(note.last_contacted_at).toISOString().slice(0, 10)).toBe('2026-10-10');
    const audit = (await db.query<any>('SELECT details FROM platform_admin_audit WHERE action=$1', [action])).rows[0].details;
    expect(audit.records).toHaveLength(8);
    expect(audit).toMatchObject({ total_eur: 48, student_invoices_changed: false, emails_sent: false });
    expect(audit.executor).toContain('platform support');
    expect(credits.filter(row => row.reason.includes('nėra mokėjimo patvirtinimas'))).toHaveLength(2);
  });

  it('is idempotent and credits each child once on the next bill, including both still unpaid sources', async () => {
    await db.exec(sql);
    await db.exec(sql);
    expect((await db.query<any>('SELECT count(*)::int n FROM school_invoice_overpayments')).rows[0].n).toBe(8);
    for (let index = 0; index < sources.length; index++) {
      const next = await nextInvoice(id(100 + index), 10, 20);
      expect(Number(next.credit_applied_eur)).toBe(6);
      expect(Number(next.total_eur) - Number(next.credit_applied_eur)).toBe(14);
      expect(Number((await nextInvoice(id(100 + index), 11, 20)).credit_applied_eur)).toBe(0);
    }
    expect((await db.query<any>(`SELECT count(*)::int n FROM school_monthly_invoices
      WHERE invoice_number IN('PAM-828','PAM-844') AND payment_status='pending'`)).rows[0].n).toBe(2);
    expect((await db.query<any>('SELECT sum(amount_eur) amount FROM school_invoice_overpayment_uses WHERE released_at IS NULL')).rows[0].amount).toBe('48.00');
  });

  it('carries unused credit forward if the next bill is smaller than EUR 6', async () => {
    await db.exec(sql);
    expect(Number((await nextInvoice(id(102), 10, 4)).credit_applied_eur)).toBe(4);
    expect(Number((await nextInvoice(id(102), 11, 20)).credit_applied_eur)).toBe(2);
    expect(Number((await nextInvoice(id(102), 12, 20)).credit_applied_eur)).toBe(0);
  });

  it('rolls back every credit and note if an invoiced lesson price has changed', async () => {
    await db.query('UPDATE school_monthly_invoice_lines SET unit_price_eur=7 WHERE invoice_id=$1', [sources[1][0]]);
    await rejected(sql, 'EUR 6 cancelled lesson');
    expect((await db.query<any>('SELECT count(*)::int n FROM school_invoice_overpayments')).rows[0].n).toBe(0);
    expect((await db.query<any>('SELECT count(*)::int n FROM student_admin_notes')).rows[0].n).toBe(1);
    expect((await db.query<any>('SELECT count(*)::int n FROM platform_admin_audit WHERE action=$1', [action])).rows[0].n).toBe(0);
  });

  it('stops if a later invoice exists or a credit was explicitly voided', async () => {
    const next = await nextInvoice(id(100), 10, 20);
    await rejected(sql, 'later invoice already exists');
    await db.query('DELETE FROM school_monthly_invoices WHERE id=$1', [next.id]);
    await db.exec(sql);
    await db.query(`UPDATE school_invoice_overpayments SET voided_at=now(),voided_by=$1,void_reason='Cancelled by school'
      WHERE source_invoice_id=$2`, [approver, sources[0][0]]);
    await rejected(sql, 'existing correction changed');
  });

  it('retains the ordinary paid-only overpayment registration rule', async () => {
    await rejected(`SELECT register_school_invoice_overpayment('${org}','${sources[2][0]}',6,'Ordinary unpaid overpayment','${id(999)}','${approver}')`, 'apmokėtos sąskaitos');
  });
});
