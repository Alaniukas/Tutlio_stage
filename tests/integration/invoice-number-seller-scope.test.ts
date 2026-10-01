import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('separates company and tutor sequences while preserving seller duplicates and legacy invoices', async () => {
  const db = new PGlite();
  const org = '00000000-0000-4000-8000-000000000001';
  const tutor = '00000000-0000-4000-8000-000000000002';
  const admin = '00000000-0000-4000-8000-000000000003';
  const other = '00000000-0000-4000-8000-000000000004';
  try {
    await db.exec(`
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, full_name text);
      CREATE TABLE public.invoice_profiles(user_id uuid, organization_id uuid,
        entity_type text, business_name text, company_code text, activity_number text, personal_code text);
      CREATE TABLE public.invoices(id text PRIMARY KEY, issued_by_user_id uuid,
        organization_id uuid, invoice_number text, seller_snapshot jsonb, status text DEFAULT 'issued');
      CREATE TABLE public.invoice_line_items(invoice_id text, session_ids uuid[]);
      CREATE TABLE public.sessions(id uuid, tutor_id uuid);
      CREATE UNIQUE INDEX uq_invoices_org_invoice_number ON public.invoices(organization_id, invoice_number)
        WHERE organization_id IS NOT NULL;
      INSERT INTO public.profiles VALUES ('${tutor}', 'Tutor'), ('${admin}', 'Admin'), ('${other}', 'Other Tutor');
      INSERT INTO public.invoice_profiles VALUES
        (NULL, '${org}', 'mb', 'Legal Company', '123', NULL, NULL),
        ('${tutor}', NULL, 'individual', NULL, NULL, '456', NULL),
        ('${other}', NULL, 'individual', NULL, NULL, '789', NULL);
      INSERT INTO public.sessions VALUES ('${org}', '${tutor}');
      INSERT INTO public.invoices(id, issued_by_user_id, organization_id, invoice_number, seller_snapshot) VALUES
        ('legacy-tutor', '${tutor}', '${org}', 'SF-001', '{"name":"Tutor","activityNumber":"456"}'),
        ('company', '${tutor}', '${org}', 'SF-002', '{"name":"Legal Company","companyCode":"123"}'),
        ('admin-for-tutor', '${admin}', '${org}', 'SF-003', '{"name":"Tutor","activityNumber":"456"}');
      INSERT INTO public.invoice_line_items VALUES ('company', ARRAY['${org}'::uuid]),
        ('admin-for-tutor', ARRAY['${org}'::uuid]);
    `);
    await db.exec(readFileSync('supabase/migrations/20261001134821_invoice_numbers_by_seller.sql', 'utf8'));
    expect((await db.query('SELECT id, seller_user_id FROM public.invoices ORDER BY id')).rows).toEqual([
      { id: 'admin-for-tutor', seller_user_id: tutor },
      { id: 'company', seller_user_id: null },
      { id: 'legacy-tutor', seller_user_id: tutor },
    ]);
    // The same number belongs to three independent sellers, even when the
    // company and tutor invoices share an administrator and organization.
    await db.exec(`
      INSERT INTO public.invoices(id, issued_by_user_id, organization_id, seller_user_id, invoice_number, seller_snapshot) VALUES
        ('tutor-new', '${admin}', '${org}', '${tutor}', 'SF-002', '{"name":"Tutor"}'),
        ('other-tutor', '${admin}', '${org}', '${other}', 'SF-002', '{"name":"Other Tutor"}');
    `);
    for (const seller of [null, tutor, other]) {
      await expect(db.query(`INSERT INTO public.invoices(id, issued_by_user_id, organization_id,
        seller_user_id, invoice_number, seller_snapshot) VALUES ('duplicate', $1, $2, $3, 'SF-002', '{}')`,
      [admin, org, seller])).rejects.toThrow(/duplicate key/);
    }
    // Cancelled invoices still own their serial number.
    await db.exec(`UPDATE public.invoices SET status = 'cancelled' WHERE id = 'tutor-new'`);
    await expect(db.query(`INSERT INTO public.invoices(id, issued_by_user_id, organization_id,
      seller_user_id, invoice_number, seller_snapshot) VALUES ('reused', $1, $2, $3, 'SF-002', '{}')`,
    [tutor, org, tutor])).rejects.toThrow(/duplicate key/);
    expect((await db.query('SELECT count(*)::int AS count FROM public.invoices')).rows).toEqual([{ count: 5 }]);
  } finally {
    await db.close();
  }
});
