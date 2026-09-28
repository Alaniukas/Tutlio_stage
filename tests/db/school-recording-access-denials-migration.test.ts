import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps recording denial identities server-only and rejects non-normalized duplicates', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    `);
    await db.exec(readFileSync('supabase/migrations/20260928160100_school_recording_access_denials.sql', 'utf8'));
    const { rows } = await db.query(`
      SELECT c.relrowsecurity AS rls,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
        has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
        has_table_privilege('service_role', c.oid, 'INSERT') AS service_insert
      FROM pg_class c WHERE c.oid = 'public.school_recording_access_denials'::regclass
    `);
    expect(rows[0]).toMatchObject({ rls: true, authenticated_select: false, authenticated_insert: false, anon_select: false, service_insert: true });
    await db.exec(`INSERT INTO public.organizations VALUES ('00000000-0000-4000-8000-000000000001');`);
    await expect(db.exec(`INSERT INTO public.school_recording_access_denials(organization_id,email)
      VALUES ('00000000-0000-4000-8000-000000000001','Parent@school.lt');`)).rejects.toThrow();
    await db.exec(`INSERT INTO public.school_recording_access_denials(organization_id,email)
      VALUES ('00000000-0000-4000-8000-000000000001','parent@school.lt');`);
    await expect(db.exec(`INSERT INTO public.school_recording_access_denials(organization_id,email)
      VALUES ('00000000-0000-4000-8000-000000000001','parent@school.lt');`)).rejects.toThrow();
  } finally { await db.close(); }
}, 30_000);
