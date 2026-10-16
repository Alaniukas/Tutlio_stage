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
