// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), tutor = id(2), child = id(3), sibling = id(4), oldId = id(5), lesson = id(6), lateLesson = id(7);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY,entity_type text);
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_number text NOT NULL,
      organization_id uuid,issued_by_user_id uuid,seller_user_id uuid,seller_snapshot jsonb,buyer_snapshot jsonb,
      issue_date date,period_start date,period_end date,grouping_type text,subtotal numeric,total_amount numeric,
      status text,origin text,pdf_meta jsonb,billing_batch_id uuid);
    CREATE TABLE invoice_line_items(invoice_id uuid REFERENCES invoices,description text NOT NULL,
      quantity int CHECK(quantity>0),unit_price numeric,total_price numeric,session_ids uuid[],school_attendance_ids uuid[]);
    CREATE TABLE school_monthly_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_number text NOT NULL,
      organization_id uuid,student_id uuid,payer_student_ids uuid[],contract_id uuid,period_start date,period_end date,
      unit_price_eur numeric,base_lessons int,base_amount_eur numeric,extra_lessons int,extra_amount_eur numeric,
      subtotal_eur numeric,discount_amount_eur numeric,discount_note text,total_eur numeric,credit_preview_eur numeric,
      credit_applied_eur numeric DEFAULT 0,extra_session_ids uuid[],billing_model text,billed_session_ids uuid[],
      payment_status text,due_date date,stripe_checkout_session_id text);
    CREATE TABLE school_monthly_invoice_lines(invoice_id uuid REFERENCES school_monthly_invoices,sort_order int,
      description text NOT NULL,unit_price_eur numeric,quantity numeric CHECK(quantity>0),original_amount_eur numeric,
      discount_type text,discount_value numeric,discount_amount_eur numeric,discount_note text,amount_eur numeric,
      source text,consultation_id uuid,session_id uuid,session_ids uuid[]);
  `);
  await db.exec(readFileSync('supabase/migrations/20261008122758_school_invoice_regeneration.sql', 'utf8'));
}, 30_000);
beforeEach(async () => {
  await db.exec(`BEGIN;
    INSERT INTO organizations VALUES('${org}','school');
    INSERT INTO invoices(id,invoice_number,organization_id,period_start,period_end,total_amount,status,pdf_meta)
      VALUES('${oldId}','OLD-T','${org}','2026-09-01','2026-09-30',45,'issued',
        '{"invoiceKind":"tutor_pay","layout":"school_tutor_meetings","tutorId":"${tutor}","schoolMeetingKeys":["online"]}');
    INSERT INTO invoice_line_items VALUES('${oldId}','Online',1,45,45,ARRAY['${lesson}']::uuid[],'{}');
    INSERT INTO school_monthly_invoices(id,invoice_number,organization_id,student_id,payer_student_ids,
      period_start,period_end,total_eur,payment_status,billing_model,billed_session_ids,extra_session_ids)
      VALUES('${oldId}','OLD-P','${org}','${child}',ARRAY['${child}','${sibling}']::uuid[],
        '2026-09-01','2026-09-30',12,'pending','actual',ARRAY['${lesson}']::uuid[],'{}');
    INSERT INTO school_monthly_invoice_lines(invoice_id,description,quantity,session_ids)
      VALUES('${oldId}','Online',1,ARRAY['${lesson}']::uuid[]);
  `);
});
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE'); });
afterAll(async () => { await db?.close(); });

async function snapshot(kind: 'tutor' | 'payer') {
  return (await db.query<{ value: any }>(`SELECT to_jsonb(i) AS value FROM ${kind === 'tutor' ? 'invoices' : 'school_monthly_invoices'} i WHERE id=$1`, [oldId])).rows[0].value;
}
function invoice(kind: 'tutor' | 'payer') {
  return { organization_id: org, invoice_number: 'NEW', period_start: '2026-09-01', period_end: '2026-09-30',
    ...(kind === 'tutor' ? { issued_by_user_id: tutor, seller_user_id: tutor, seller_snapshot: {}, buyer_snapshot: {},
      issue_date: '2026-10-08', grouping_type: 'single', subtotal: 90, total_amount: 90,
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: tutor, schoolMeetingKeys: ['online', 'in-person'] } }
      : { student_id: child, payer_student_ids: [child, sibling], subtotal_eur: 24, discount_amount_eur: 0, total_eur: 24,
        credit_preview_eur: 0, billed_session_ids: [lesson, lateLesson], due_date: '2026-10-15' }),
  };
}
function lines(kind: 'tutor' | 'payer') {
  return [{ description: 'Online and late in-person', quantity: 2, session_ids: [lesson, lateLesson],
    ...(kind === 'tutor' ? { unit_price: 45, total_price: 90, school_attendance_ids: [] }
      : { sort_order: 0, unit_price_eur: 12, original_amount_eur: 24, amount_eur: 24,
        discount_amount_eur: 0, source: 'lesson', session_id: lesson }),
  }];
}
async function replace(kind: 'tutor' | 'payer', previous: any, next = invoice(kind), nextLines = lines(kind)) {
  const result = await db.query<{ value: any }>('SELECT replace_school_invoices($1,$2,$3,$4,$5,$6) AS value',
    [kind, org, kind === 'tutor' ? tutor : null, JSON.stringify([previous]), JSON.stringify(next), JSON.stringify(nextLines)]);
  return result.rows[0].value;
}
async function rejected(action: () => Promise<unknown>, message: string) {
  await db.exec('SAVEPOINT rejection');
  await expect(action()).rejects.toThrow(message);
  await db.exec('ROLLBACK TO SAVEPOINT rejection');
}

describe('atomic school invoice regeneration', () => {
  it.each(['tutor', 'payer'] as const)('replaces %s invoice with late lessons and retains the cancelled document', async kind => {
    const result = await replace(kind, await snapshot(kind));
    expect(result.invoice_number).toBe('NEW');
    expect(Number(kind === 'tutor' ? result.total_amount : result.total_eur)).toBe(kind === 'tutor' ? 90 : 24);
    const old = await snapshot(kind);
    expect(kind === 'tutor' ? old.status : old.payment_status).toBe('cancelled');
    const table = kind === 'tutor' ? 'invoice_line_items' : 'school_monthly_invoice_lines';
    expect((await db.query<any>(`SELECT session_ids FROM ${table} WHERE invoice_id=$1`, [result.id])).rows[0].session_ids)
      .toEqual([lesson, lateLesson]);
    expect((await db.query<any>(`SELECT count(*)::int AS n FROM ${table} WHERE invoice_id=$1`, [oldId])).rows[0].n).toBe(1);
  });
  it.each(['tutor', 'payer'] as const)('rolls back %s cancellation when a new line cannot be saved', async kind => {
    const previous = await snapshot(kind);
    await rejected(() => replace(kind, previous, invoice(kind), [{ ...lines(kind)[0], quantity: 0 }]), 'check constraint');
    expect(await snapshot(kind)).toEqual(previous);
    expect((await db.query<any>(`SELECT count(*)::int AS n FROM ${kind === 'tutor' ? 'invoices' : 'school_monthly_invoices'}`)).rows[0].n).toBe(1);
  });
  it.each(['tutor', 'payer'] as const)('rejects stale %s confirmations and a second replacement', async kind => {
    const previous = await snapshot(kind);
    await replace(kind, previous);
    await rejected(() => replace(kind, previous), 'cannot be regenerated');
  });
  it.each(['tutor', 'payer'] as const)('preserves %s payments made after preview', async kind => {
    const previous = await snapshot(kind);
    await db.exec(`UPDATE ${kind === 'tutor' ? 'invoices SET status' : 'school_monthly_invoices SET payment_status'}='paid' WHERE id='${oldId}'`);
    await rejected(() => replace(kind, previous), 'cannot be regenerated');
    const current = await snapshot(kind);
    expect(kind === 'tutor' ? current.status : current.payment_status).toBe('paid');
  });
  it('does not drop another child from a family invoice', async () => {
    await rejected(async () => replace('payer', await snapshot('payer'), { ...invoice('payer'), payer_student_ids: [child] }), 'cannot be regenerated');
  });
  it.each(['stripe_checkout_session_id', 'credit_applied_eur'] as const)('preserves payer invoice with %s', async column => {
    await db.exec(`UPDATE school_monthly_invoices SET ${column}=${column === 'credit_applied_eur' ? 5 : "'cs_active'"}`);
    await rejected(async () => replace('payer', await snapshot('payer')), 'cannot be regenerated');
  });
  it('rejects other periods and foreign organizations', async () => {
    const previous = await snapshot('tutor');
    await rejected(() => replace('tutor', previous, { ...invoice('tutor'), period_start: '2026-09-02' }), 'pasikeitė');
    await db.exec(`UPDATE invoices SET organization_id='${id(99)}' WHERE id='${oldId}'`);
    await rejected(async () => replace('tutor', await snapshot('tutor')), 'pasikeitė');
  });
  it('cannot be called by an authenticated browser or anonymous client', async () => {
    for (const role of ['authenticated', 'anon']) {
      const { rows } = await db.query<any>("SELECT has_function_privilege($1,'public.replace_school_invoices(text,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE') AS allowed", [role]);
      expect(rows[0].allowed).toBe(false);
    }
  });
});
