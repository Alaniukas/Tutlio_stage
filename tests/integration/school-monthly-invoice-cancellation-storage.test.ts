import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps cancelled invoice history while allowing one replacement and blocking pending or paid duplicates', async () => {
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
    for (const status of ['pending', 'paid']) {
      await db.exec(`UPDATE public.school_monthly_invoices SET payment_status = '${status}' WHERE id = 'new'`);
      await expect(db.exec(`INSERT INTO public.school_monthly_invoices VALUES ('duplicate', 'kajus', NULL, '2026-09-01', 'pending')`))
        .rejects.toThrow(/duplicate key/);
    }
    expect((await db.query(`SELECT id, payment_status FROM public.school_monthly_invoices ORDER BY id`)).rows).toEqual([
      { id: 'new', payment_status: 'paid' }, { id: 'old', payment_status: 'cancelled' },
    ]);
    await db.exec(`UPDATE public.school_monthly_invoices SET payment_status = 'cancelled' WHERE id = 'new'`);
    await db.exec(`INSERT INTO public.school_monthly_invoices VALUES ('second-replacement', 'kajus', NULL, '2026-09-01', 'pending')`);
    expect((await db.query(`SELECT COUNT(*)::int AS count FROM public.school_monthly_invoices`)).rows).toEqual([{ count: 3 }]);
  } finally {
    await db.close();
  }
});
