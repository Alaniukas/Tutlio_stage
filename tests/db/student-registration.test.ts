// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_app_meta_data jsonb DEFAULT '{}', raw_user_meta_data jsonb DEFAULT '{}', email_confirmed_at timestamptz, last_sign_in_at timestamptz);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY, features jsonb DEFAULT '{}');
    CREATE TABLE public.students(id uuid PRIMARY KEY, organization_id uuid, tutor_id uuid, full_name text,
      linked_user_id uuid, parent_user_id uuid, created_at timestamptz DEFAULT now() - interval '2 days', detached_at timestamptz, enrollment_status text);
    CREATE TABLE public.parent_profiles(id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE public.parent_students(parent_id uuid, student_id uuid);
    CREATE TABLE public.sessions(id uuid PRIMARY KEY, student_id uuid, tutor_id uuid, status text, start_time timestamptz);
  `);
  await db.exec(readFileSync('supabase/migrations/20261013153130_student_registration_monitoring.sql', 'utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE student_registration_reminders, sessions, parent_students, parent_profiles, students, organizations, auth.users CASCADE;
    INSERT INTO organizations(id) VALUES ('${id(1)}'),('${id(2)}');
    INSERT INTO students(id,organization_id,tutor_id,full_name) VALUES ('${id(11)}','${id(1)}','${id(21)}','Client');`);
});

const states = async (org = id(1), tutor: string | null = null) => (await db.query<{ registration_pending: boolean; next_session_at: string | null }>(
  'SELECT * FROM org_student_registration_states($1::uuid, $2::uuid)', [org, tutor],
)).rows;

describe('server-only registration projection', () => {
  it('does not mistake a pre-created, email-confirmed account for a completed registration', async () => {
    await db.exec(`INSERT INTO auth.users(id,raw_app_meta_data,email_confirmed_at) VALUES ('${id(31)}','{"provisioned_by_organization":"${id(1)}"}',now());
      UPDATE students SET linked_user_id='${id(31)}';`);
    expect((await states())[0].registration_pending).toBe(true);
  });
  it('recognizes server-owned activation, legacy activation and actual sign-in', async () => {
    await db.exec(`INSERT INTO auth.users(id,raw_app_meta_data) VALUES ('${id(31)}','{"provisioned_by_organization":"${id(1)}"}'); UPDATE students SET linked_user_id='${id(31)}';`);
    for (const patch of [
      `raw_app_meta_data = raw_app_meta_data || '{"mv_account_activated_at":"2026-10-13T10:00:00Z"}'`,
      `raw_app_meta_data = '{"provisioned_by_organization":"${id(1)}"}', raw_user_meta_data = '{"mv_account_activated_at":"2026-10-13T10:00:00Z"}'`,
      `raw_user_meta_data = '{}', last_sign_in_at = now()`,
    ]) {
      await db.exec(`UPDATE auth.users SET ${patch};`);
      expect((await states())[0].registration_pending).toBe(false);
    }
  });
  it('recognizes a registered parent and a second parent through explicit family links', async () => {
    await db.exec(`INSERT INTO auth.users(id,email_confirmed_at) VALUES ('${id(31)}',now());
      INSERT INTO parent_profiles VALUES ('${id(41)}','${id(31)}'); INSERT INTO parent_students VALUES ('${id(41)}','${id(11)}');`);
    expect((await states())[0].registration_pending).toBe(false);
  });
  it('recognizes parent-only registration without requiring a student login', async () => {
    await db.exec(`INSERT INTO auth.users(id,email_confirmed_at) VALUES ('${id(31)}',now()); UPDATE students SET parent_user_id='${id(31)}';`);
    expect((await states())[0].registration_pending).toBe(false);
  });
  it('recognizes self-registration without treating unconfirmed self-registration as complete', async () => {
    await db.exec(`INSERT INTO auth.users(id) VALUES ('${id(31)}'); UPDATE students SET linked_user_id='${id(31)}';`);
    expect((await states())[0].registration_pending).toBe(true);
    await db.exec('UPDATE auth.users SET email_confirmed_at=now();');
    expect((await states())[0].registration_pending).toBe(false);
  });
  it('limits results to the organization and assigned tutor and omits departed or archived clients', async () => {
    expect(await states(id(2))).toEqual([]);
    expect(await states(id(1), id(22))).toEqual([]);
    expect(await states(id(1), id(21))).toHaveLength(1);
    await db.exec("UPDATE students SET enrollment_status='left';");
    expect(await states()).toEqual([]);
    await db.exec("UPDATE students SET enrollment_status='active', detached_at=now();");
    expect(await states()).toEqual([]);
  });
  it('selects only the first future active lesson, ignoring cancelled and historical lessons', async () => {
    await db.exec(`INSERT INTO sessions VALUES
      ('${id(51)}','${id(11)}','${id(21)}','active',now()-interval '1 day'),
      ('${id(52)}','${id(11)}','${id(21)}','cancelled',now()+interval '1 hour'),
      ('${id(53)}','${id(11)}','${id(21)}','active',now()+interval '2 hours');`);
    expect((await states())[0].next_session_at).not.toBeNull();
    const next = await db.query('SELECT start_time FROM sessions WHERE id=$1', [id(53)]);
    expect((await states())[0].next_session_at).toEqual(next.rows[0].start_time);
  });
  it('denies browser roles access to the auth projection and reminder ledger', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role};`);
      try {
        await expect(states()).rejects.toThrow(/permission denied/);
        await expect(db.query('SELECT * FROM student_registration_reminders')).rejects.toThrow(/permission denied/);
      } finally { await db.exec('RESET ROLE;'); }
    }
    await db.exec('SET ROLE service_role;');
    try { expect(await states()).toHaveLength(1); } finally { await db.exec('RESET ROLE;'); }
  });
});
