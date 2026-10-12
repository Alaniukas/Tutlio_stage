// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MOKSLO_VAISIAI_DEMO_ORG_ID, MOKSLO_VAISIAI_ORG_ID } from '../../src/lib/marketMoney';

const ids = {
  student: '00000000-0000-4000-8000-000000000001',
  parent: '00000000-0000-4000-8000-000000000002',
  tutor: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
  child: '00000000-0000-4000-8000-000000000005',
  lesson: '00000000-0000-4000-8000-000000000006',
  otherOrg: '00000000-0000-4000-8000-000000000007',
};
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, features jsonb);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE public.students (id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE public.organization_admins (
      user_id uuid, organization_id uuid, status text, accepted_at timestamptz, role text, permissions jsonb
    );
    CREATE TABLE public.sessions (
      id uuid PRIMARY KEY, student_id uuid, tutor_id uuid, status text, start_time timestamptz, end_time timestamptz
    );
    CREATE FUNCTION public.org_has_feature(p_org uuid, p_feature text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT COALESCE((features ->> p_feature)::boolean, false) FROM public.organizations WHERE id = p_org $$;
    INSERT INTO public.organizations VALUES
      ('${MOKSLO_VAISIAI_ORG_ID}', '{"disable_student_reschedule":true,"public_name":"MV"}'),
      ('${MOKSLO_VAISIAI_DEMO_ORG_ID}', '{"disable_student_reschedule":true}'),
      ('${ids.otherOrg}', '{"disable_student_reschedule_cancel":true}');
    INSERT INTO public.profiles VALUES ('${ids.tutor}', '${MOKSLO_VAISIAI_ORG_ID}');
    INSERT INTO public.students VALUES ('${ids.child}', '${MOKSLO_VAISIAI_ORG_ID}');
    INSERT INTO public.organization_admins VALUES
      ('${ids.admin}', '${MOKSLO_VAISIAI_ORG_ID}', 'active', now(), 'owner', '{}');
    INSERT INTO public.sessions VALUES
      ('${ids.lesson}', '${ids.child}', '${ids.tutor}', 'active', '2026-10-20T10:00:00Z', '2026-10-20T11:00:00Z');
  `);
  // Retain the existing reschedule trigger, then apply the new permission split.
  const oldMigration = readFileSync('supabase/migrations/20260921100000_allow_tutor_reschedule_mokslo_vaisiai.sql', 'utf8');
  await db.exec(oldMigration.slice(oldMigration.indexOf('CREATE OR REPLACE FUNCTION')));
  await db.exec(readFileSync('supabase/migrations/20261012065009_mokslo_vaisiai_student_reschedule_only.sql', 'utf8'));
  await db.exec(`
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT ON public.organizations, public.profiles, public.students, public.organization_admins TO authenticated;
    GRANT SELECT, UPDATE ON public.sessions TO authenticated;
  `);
}, 30_000);

beforeEach(async () => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  await db.query(`UPDATE public.sessions SET status = 'active', start_time = '2026-10-20T10:00:00Z', end_time = '2026-10-20T11:00:00Z'`);
});
afterAll(async () => { await db?.close(); });

describe('MV family reschedule-only database permissions', () => {
  it('enables rescheduling and disables cancellation for both MV orgs without changing other settings', async () => {
    const rows = (await db.query<{ id: string; features: Record<string, unknown> }>('SELECT id, features FROM public.organizations')).rows;
    for (const id of [MOKSLO_VAISIAI_ORG_ID, MOKSLO_VAISIAI_DEMO_ORG_ID]) {
      expect(rows.find((row) => row.id === id)?.features).toMatchObject({
        disable_student_reschedule: false, disable_student_cancel: true, disable_student_reschedule_cancel: false,
      });
    }
    expect(rows.find((row) => row.id === MOKSLO_VAISIAI_ORG_ID)?.features.public_name).toBe('MV');
    expect(rows.find((row) => row.id === ids.otherOrg)?.features).toEqual({ disable_student_reschedule_cancel: true });
  });

  it.each(['student', 'parent'] as const)('allows %s time changes and rejects cancellation', async (actor) => {
    await db.exec('SET ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [ids[actor]]);
    await db.query(`UPDATE public.sessions SET start_time = '2026-10-21T10:00:00Z', end_time = '2026-10-21T11:00:00Z' WHERE id = $1`, [ids.lesson]);
    await expect(db.query(`UPDATE public.sessions SET status = 'cancelled' WHERE id = $1`, [ids.lesson]))
      .rejects.toMatchObject({ code: '42501', message: 'disable_student_cancel' });
    const row = (await db.query<{ status: string; start_time: Date }>('SELECT status, start_time FROM public.sessions WHERE id = $1', [ids.lesson])).rows[0];
    expect(row.status).toBe('active');
    expect(new Date(row.start_time).toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });

  it.each(['tutor', 'admin', 'service'] as const)('preserves %s cancellation permission', async (actor) => {
    if (actor !== 'service') await db.exec('SET ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [actor === 'service' ? '' : ids[actor]]);
    await db.query(`UPDATE public.sessions SET status = 'cancelled' WHERE id = $1`, [ids.lesson]);
    expect((await db.query<{ status: string }>('SELECT status FROM public.sessions')).rows[0].status).toBe('cancelled');
  });
});
