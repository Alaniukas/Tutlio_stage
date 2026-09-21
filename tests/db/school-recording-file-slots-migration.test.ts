import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps recording-to-slot assignments behind service-only access', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.school_class_groups(id uuid PRIMARY KEY);
    `);
    await db.exec(readFileSync('supabase/migrations/20260921170000_school_recording_file_slots.sql', 'utf8'));
    const { rows } = await db.query(`
      SELECT c.relrowsecurity AS rls,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select
      FROM pg_class c WHERE c.oid = 'public.school_recording_file_slots'::regclass
    `);
    expect(rows[0]).toMatchObject({ rls: true, authenticated_select: false, anon_select: false });
  } finally {
    await db.close();
  }
}, 30_000);
