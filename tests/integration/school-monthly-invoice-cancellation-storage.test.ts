import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps cancelled invoice history and allows a supplemental invoice in the same period', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE public.school_monthly_invoices (
        id text PRIMARY KEY, student_id text NOT NULL, contract_id text,
        period_start date NOT NULL, payment_status text NOT NULL DEFAULT 'pending'
      );
      CREATE UNIQUE INDEX idx_school_monthly_invoices_student_period
        ON public.school_monthly_invoices(student_id, period_start) WHERE contract_id IS NULL;
      INSERT INTO public.school_monthly_invoices VALUES ('old', 'kajus', NULL, '2026-09-01', 'cancelled');
    `);
    await db.exec(readFileSync('supabase/migrations/20261001133628_school_monthly_invoice_reissue_after_cancellation.sql', 'utf8'));
    await db.exec(`INSERT INTO public.school_monthly_invoices VALUES ('new', 'kajus', NULL, '2026-09-01', 'pending')`);
    await db.exec(readFileSync('supabase/migrations/20261016170000_school_monthly_supplemental_invoices.sql', 'utf8'));
    await db.exec(`UPDATE public.school_monthly_invoices SET payment_status = 'paid' WHERE id = 'new'`);
    await db.exec(`INSERT INTO public.school_monthly_invoices VALUES ('supplemental', 'kajus', NULL, '2026-09-01', 'pending')`);
    expect((await db.query(`SELECT id FROM public.school_monthly_invoices WHERE payment_status <> 'cancelled' ORDER BY id`)).rows)
      .toEqual([{ id: 'new' }, { id: 'supplemental' }]);
  } finally {
    await db.close();
  }
});

it('stores the cancellation actor and reason while preserving the numbered invoice and source lines', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000021';
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${admin}');
      CREATE TABLE school_monthly_invoices(id text PRIMARY KEY, invoice_number text, total_eur numeric,
        payment_status text, pdf_path text, billed_session_ids text[]);
      INSERT INTO school_monthly_invoices VALUES ('test', 'PAM-827', 18, 'pending', 'original.pdf', ARRAY['lesson']);
      CREATE TABLE school_monthly_invoice_lines(invoice_id text REFERENCES school_monthly_invoices, amount_eur numeric);
      INSERT INTO school_monthly_invoice_lines VALUES ('test', 18);
    `);
    await db.exec(readFileSync('supabase/migrations/20261021092700_school_monthly_invoice_cancellation_audit.sql', 'utf8'));
    await db.query(`UPDATE school_monthly_invoices SET payment_status='cancelled', cancelled_at=now(),
      cancelled_by=$1, cancellation_reason=$2 WHERE id='test' AND payment_status='pending'`, [admin, 'Testinė sąskaita']);
    const invoice = (await db.query<any>(`SELECT * FROM school_monthly_invoices WHERE id='test'`)).rows[0];
    expect(invoice).toMatchObject({ invoice_number: 'PAM-827', payment_status: 'cancelled',
      pdf_path: 'original.pdf', billed_session_ids: ['lesson'], cancelled_by: admin, cancellation_reason: 'Testinė sąskaita' });
    expect(Number(invoice.total_eur)).toBe(18);
    expect(invoice.cancelled_at).toBeTruthy();
    expect((await db.query('SELECT * FROM school_monthly_invoice_lines')).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM school_monthly_invoices WHERE payment_status='pending'")).rows).toHaveLength(0);
  } finally { await db.close(); }
});
