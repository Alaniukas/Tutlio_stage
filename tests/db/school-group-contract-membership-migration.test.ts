// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('defaults to three, constrains thresholds, and allows only the same school administrator to change them', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA private; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.user_id', true) $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role', true) $$;
      CREATE FUNCTION private.org_admin_permission_gate(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION private.org_admin_role_grants_permission(text, text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('owner', 'admin') $$;
      CREATE TABLE public.organization_admins(organization_id text, user_id text, status text, role text, permissions jsonb);
      CREATE TABLE public.school_class_groups(id text PRIMARY KEY, organization_id text);
      CREATE TABLE public.school_contracts(id text PRIMARY KEY);
      INSERT INTO organization_admins VALUES ('school', 'admin', 'active', 'admin', '{}'), ('other', 'other-admin', 'active', 'owner', '{}');
      SET test.role = 'authenticated'; SET test.user_id = 'teacher';
    `);
    await db.exec(readFileSync('supabase/migrations/20260928160000_school_group_contract_membership.sql', 'utf8'));
    await db.exec("INSERT INTO school_class_groups(id, organization_id) VALUES ('group', 'school')");
    expect((await db.query('SELECT minimum_active_students FROM school_class_groups')).rows[0]).toEqual({ minimum_active_students: 3 });
    await expect(db.exec("UPDATE school_class_groups SET minimum_active_students = 2 WHERE id = 'group'")).rejects.toThrow('Only organization administrators');
    await db.exec("SET test.user_id = 'other-admin'");
    await expect(db.exec("UPDATE school_class_groups SET minimum_active_students = 2 WHERE id = 'group'")).rejects.toThrow('Only organization administrators');
    await db.exec("SET test.user_id = 'admin'; UPDATE school_class_groups SET minimum_active_students = 2 WHERE id = 'group'");
    await expect(db.exec("UPDATE school_class_groups SET minimum_active_students = 4 WHERE id = 'group'")).rejects.toThrow('minimum_active_students_check');
    await db.exec("SET test.role = 'service_role'; SET test.user_id = ''; UPDATE school_class_groups SET minimum_active_students = 3 WHERE id = 'group'");
    await db.exec("INSERT INTO school_contracts VALUES ('contract', '{\"enrolled_at\":\"original\"}')");
    await expect(db.exec("UPDATE school_contracts SET suspended_group_membership = '[]'")).rejects.toThrow('suspended_group_membership_check');
  } finally {
    await db.close();
  }
}, 30_000);
