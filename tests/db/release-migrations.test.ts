import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const migration = (filename: string) =>
  readFileSync(`supabase/migrations/${filename}`, 'utf8');

it('applies the pending tutor-pay, permission, and consultation migrations', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE SCHEMA private;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION private.org_admin_permission_gate(text[]) RETURNS boolean
        LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION public.is_school_admin(uuid) RETURNS boolean
        LANGUAGE sql AS $$ SELECT true $$;

      CREATE TABLE public.organizations(
        id uuid PRIMARY KEY,
        default_company_commission_percent integer NOT NULL DEFAULT 0
      );
      CREATE TABLE public.profiles(
        id uuid PRIMARY KEY,
        organization_id uuid,
        company_commission_percent integer NOT NULL DEFAULT 0
      );
      CREATE TABLE public.tutor_invites(
        id uuid PRIMARY KEY,
        company_commission_percent integer NOT NULL DEFAULT 0
      );
      CREATE TABLE public.students(
        id uuid PRIMARY KEY,
        linked_user_id uuid
      );
      CREATE TABLE public.subjects(id uuid PRIMARY KEY);
      CREATE TABLE public.sessions(id uuid PRIMARY KEY);
      CREATE TABLE public.parent_profiles(id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.parent_students(parent_id uuid, student_id uuid);
      CREATE TABLE public.student_individual_pricing(id uuid PRIMARY KEY);
      ALTER TABLE public.student_individual_pricing ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public.school_monthly_invoices(
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES public.organizations(id),
        student_id uuid NOT NULL REFERENCES public.students(id),
        contract_id uuid NOT NULL,
        period_start date NOT NULL
      );
    `);

    await db.exec(migration('20260910175000_tutor_pay_decimal_and_persistent.sql'));
    await db.exec(migration('20260911120000_org_admin_individual_pricing_students_edit.sql'));
    await db.exec(migration('20260911120200_school_consultations.sql'));
    await db.exec(migration('20260911120300_tutor_invites_help_team_category.sql'));

    const moneyColumns = (await db.query(`
      SELECT table_name, column_name, numeric_scale
      FROM information_schema.columns
      WHERE (table_name, column_name) IN (
        ('profiles', 'company_commission_percent'),
        ('tutor_invites', 'company_commission_percent'),
        ('organizations', 'default_company_commission_percent')
      )
      ORDER BY table_name
    `)).rows;
    expect(moneyColumns).toHaveLength(3);
    expect(moneyColumns.every((column: any) => column.numeric_scale === 2)).toBe(true);

    const permissionPolicies = (await db.query(`
      SELECT policyname, with_check, qual
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'student_individual_pricing'
        AND policyname LIKE 'org_admin_permission_%'
    `)).rows as { policyname: string; with_check: string | null; qual: string | null }[];
    expect(permissionPolicies).toHaveLength(3);
    expect(JSON.stringify(permissionPolicies)).toContain('students.edit');
    expect(JSON.stringify(permissionPolicies)).toContain('finance.edit');

    const consultationTables = (await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'school_consultation_requests',
          'school_consultations',
          'student_lesson_discounts',
          'school_monthly_invoice_lines'
        )
    `)).rows;
    expect(consultationTables).toHaveLength(4);

    const addedColumns = (await db.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE (table_name, column_name) IN (
        ('students', 'ppt_adapted'),
        ('students', 'ppt_individualized'),
        ('profiles', 'help_team_category'),
        ('tutor_invites', 'help_team_category'),
        ('sessions', 'consultation_joinable')
      )
    `)).rows;
    expect(addedColumns).toHaveLength(5);

    const contractColumn = (await db.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'school_monthly_invoices'
        AND column_name = 'contract_id'
    `)).rows[0] as { is_nullable: string };
    expect(contractColumn.is_nullable).toBe('YES');
  } finally {
    await db.close();
  }
}, 30_000);
