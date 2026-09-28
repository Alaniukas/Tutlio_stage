// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const TUTOR = '10000000-0000-4000-8000-000000000001';
const OTHER_TUTOR = '10000000-0000-4000-8000-000000000002';
const STUDENT = '20000000-0000-4000-8000-000000000001';
const OTHER_STUDENT = '20000000-0000-4000-8000-000000000002';
const SUBJECT = '30000000-0000-4000-8000-000000000001';
const PACKAGE = '40000000-0000-4000-8000-000000000001';
const RECURRING = '50000000-0000-4000-8000-000000000001';
const GROUP = '60000000-0000-4000-8000-000000000001';
const POOL_ORG = 'b0a00000-7e57-4000-8000-000000000001';
const sessionId = (number: number) => `70000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
let db: PGlite;

async function insertSession(number: number, patch: Record<string, unknown> = {}) {
  const row = { id: sessionId(number), tutor_id: TUTOR, student_id: STUDENT, subject_id: SUBJECT,
    start_time: '2030-01-04T10:00:00Z', end_time: '2030-01-04T11:00:00Z', status: 'active',
    ...patch };
  const columns = Object.keys(row);
  await db.query(`INSERT INTO sessions (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`, Object.values(row));
}

async function remove(numbers: number[], options: { exclusions?: unknown[]; deactivate?: string[]; family?: boolean; protect?: boolean; tutors?: string[] } = {}) {
  return (await db.query<{ deleted: Array<{ id: string }> }>(
    'SELECT delete_sessions_with_recurrence($1::uuid[], $2::jsonb, $3::uuid[], $4::boolean, $5::boolean, $6::uuid[], $7::uuid) AS deleted',
    [numbers.map(sessionId), JSON.stringify(options.exclusions || []), options.deactivate || [], options.family || false,
      options.protect ?? true, options.tutors || [TUTOR], options.family ? STUDENT : null],
  )).rows[0].deleted;
}

const exclusion = (scope: string, options: { group?: boolean; student?: string | null; start?: string | null } = {}) => ({
  recurring_session_id: options.group ? null : RECURRING,
  class_group_id: options.group ? GROUP : null,
  student_id: options.student === undefined ? STUDENT : options.student,
  scope, start_time: scope === 'all' ? null : options.start || '2030-01-04T10:00:00Z',
});

describe('atomic session deletion migration', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
      CREATE TABLE students(id uuid PRIMARY KEY);
      CREATE TABLE subjects(id uuid PRIMARY KEY, is_group boolean, max_students integer);
      CREATE TABLE recurring_individual_sessions(id uuid PRIMARY KEY, tutor_id uuid, active boolean DEFAULT true);
      CREATE TABLE school_class_groups(id uuid PRIMARY KEY, tutor_id uuid);
      CREATE TABLE lesson_packages(id uuid PRIMARY KEY, pool_organization_id uuid, total_lessons integer,
        available_lessons integer, reserved_lessons integer, completed_lessons integer,
        pool_identity_key text, price_per_lesson numeric, total_price numeric, student_id uuid, tutor_id uuid,
        CHECK(available_lessons + reserved_lessons + completed_lessons <= total_lessons));
      CREATE TABLE lesson_package_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid REFERENCES lesson_packages(id),
        subject_id uuid, total_lessons integer, available_lessons integer, reserved_lessons integer, completed_lessons integer,
        CHECK(available_lessons + reserved_lessons + completed_lessons <= total_lessons));
      CREATE TABLE sessions(id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, subject_id uuid,
        start_time timestamptz, end_time timestamptz, status text, student_joined_at timestamptz, tutor_joined_at timestamptz,
        lesson_package_id uuid REFERENCES lesson_packages(id), recurring_session_id uuid REFERENCES recurring_individual_sessions(id),
        class_group_id uuid REFERENCES school_class_groups(id), available_spots integer,
        cancellation_penalty_amount numeric DEFAULT 0, penalty_resolution text, is_late_cancelled boolean DEFAULT false);
      INSERT INTO profiles VALUES ('${TUTOR}', '${POOL_ORG}'), ('${OTHER_TUTOR}', '${POOL_ORG}');
      INSERT INTO students VALUES ('${STUDENT}'), ('${OTHER_STUDENT}');
      INSERT INTO subjects VALUES ('${SUBJECT}', true, 3);
      INSERT INTO recurring_individual_sessions(id, tutor_id) VALUES ('${RECURRING}', '${TUTOR}');
      INSERT INTO school_class_groups VALUES ('${GROUP}', '${TUTOR}');
    `);
    // Exercise the existing pooled counter derivation together with this migration.
    const pooled = readFileSync('supabase/migrations/20260910174000_org_student_pooled_packages.sql', 'utf8');
    await db.exec(pooled.slice(pooled.indexOf('CREATE OR REPLACE FUNCTION public.protect_pooled_package()'),
      pooled.indexOf('CREATE OR REPLACE FUNCTION public.allocate_pooled_session()')));
    await db.exec(pooled.slice(pooled.indexOf('CREATE OR REPLACE FUNCTION public.recount_pooled_session()'),
      pooled.indexOf('-- On confirmed payment apply the pool')));
    await db.exec(readFileSync('supabase/migrations/20260928140000_session_deletion_recurrence_exclusions.sql', 'utf8'));
  }, 30_000);
  beforeEach(async () => {
    await db.exec(`TRUNCATE sessions, session_recurrence_exclusions, lesson_package_items, lesson_packages;
      UPDATE recurring_individual_sessions SET tutor_id = '${TUTOR}', active = true;
      UPDATE school_class_groups SET tutor_id = '${TUTOR}';`);
  });
  afterAll(async () => { await db.close(); });

  it('returns only still-reserved credits and rejects a repeated deletion without a second refund', async () => {
    await db.exec(`INSERT INTO lesson_packages(id, pool_organization_id, total_lessons, available_lessons, reserved_lessons, completed_lessons) VALUES ('${PACKAGE}', NULL, 5, 3, 1, 1);
      INSERT INTO lesson_package_items(package_id, subject_id, total_lessons, available_lessons, reserved_lessons, completed_lessons)
        VALUES ('${PACKAGE}', '${SUBJECT}', 5, 3, 1, 1);`);
    await insertSession(1, { lesson_package_id: PACKAGE });
    await insertSession(2, { lesson_package_id: PACKAGE, status: 'cancelled' });
    expect((await remove([1, 2])).map((row) => row.id)).toEqual(expect.arrayContaining([sessionId(1), sessionId(2)]));
    for (const table of ['lesson_packages', 'lesson_package_items']) {
      expect((await db.query(`SELECT available_lessons, reserved_lessons, completed_lessons FROM ${table}`)).rows[0])
        .toEqual({ available_lessons: 4, reserved_lessons: 0, completed_lessons: 1 });
    }
    await expect(remove([1, 2])).rejects.toThrow('Sessions changed');
    expect((await db.query('SELECT available_lessons FROM lesson_packages')).rows[0]).toEqual({ available_lessons: 4 });
  });

  it('persists a single deleted occurrence and rolls back an attempted insert batch containing it', async () => {
    await insertSession(1, { status: 'cancelled', recurring_session_id: RECURRING });
    await remove([1], { exclusions: [exclusion('single')] });
    await expect(db.exec(`INSERT INTO sessions(id, tutor_id, student_id, subject_id, recurring_session_id, start_time, end_time, status) VALUES
      ('${sessionId(2)}', '${TUTOR}', '${STUDENT}', '${SUBJECT}', '${RECURRING}', '2030-01-04T10:00:00Z', '2030-01-04T11:00:00Z', 'active'),
      ('${sessionId(3)}', '${TUTOR}', '${STUDENT}', '${SUBJECT}', '${RECURRING}', '2030-01-11T10:00:00Z', '2030-01-11T11:00:00Z', 'active');`))
      .rejects.toThrow('This recurring lesson was deleted');
    expect((await db.query('SELECT id FROM sessions')).rows).toEqual([]);
    await insertSession(3, { recurring_session_id: RECURRING, start_time: '2030-01-11T10:00:00Z' });
    expect((await db.query('SELECT id FROM sessions')).rows).toEqual([{ id: sessionId(3) }]);
  });

  it('includes newly generated group rows while preserving completed, joined and earlier occurrences', async () => {
    await insertSession(1, { class_group_id: GROUP, status: 'cancelled' });
    await insertSession(2, { class_group_id: GROUP, student_id: OTHER_STUDENT }); // missing from API snapshot
    await insertSession(3, { class_group_id: GROUP, status: 'completed' });
    await insertSession(4, { class_group_id: GROUP, student_joined_at: '2030-01-04T09:59:00Z' });
    await insertSession(5, { class_group_id: GROUP, start_time: '2020-01-01T10:00:00Z' });
    await insertSession(6, { class_group_id: GROUP, status: 'cancelled', start_time: '2029-12-28T10:00:00Z' });
    const deleted = await remove([1], { exclusions: [exclusion('future', { group: true, student: null })] });
    expect(new Set(deleted.map((row) => row.id))).toEqual(new Set([sessionId(1), sessionId(2)]));
    expect((await db.query('SELECT id FROM sessions ORDER BY id')).rows.map((row: any) => row.id))
      .toEqual([sessionId(3), sessionId(4), sessionId(5), sessionId(6)]);
    await expect(insertSession(7, { class_group_id: GROUP, start_time: '2030-01-18T10:00:00Z' }))
      .rejects.toThrow('This recurring lesson was deleted');
  });

  it('a child-specific group deletion preserves other children and leaves the group booking occupied', async () => {
    await insertSession(1, { class_group_id: GROUP, status: 'cancelled' });
    await insertSession(2, { class_group_id: GROUP, student_id: OTHER_STUDENT });
    await remove([1], { exclusions: [exclusion('single', { group: true })], family: true });
    expect((await db.query('SELECT id, available_spots FROM sessions')).rows).toEqual([{ id: sessionId(2), available_spots: 2 }]);
    await insertSession(3, { class_group_id: GROUP, student_id: OTHER_STUDENT, start_time: '2030-01-11T10:00:00Z' });
    await expect(insertSession(4, { class_group_id: GROUP })).rejects.toThrow('This recurring lesson was deleted');
  });

  it('rolls back recurrence suppression, template changes and credits if the hard delete fails', async () => {
    await db.exec(`INSERT INTO lesson_packages(id, pool_organization_id, total_lessons, available_lessons, reserved_lessons, completed_lessons) VALUES ('${PACKAGE}', NULL, 2, 1, 1, 0);
      CREATE TABLE deletion_blocker(session_id uuid REFERENCES sessions(id));`);
    try {
      await insertSession(1, { lesson_package_id: PACKAGE, recurring_session_id: RECURRING });
      await db.exec(`INSERT INTO deletion_blocker VALUES ('${sessionId(1)}');`);
      await expect(remove([1], { exclusions: [exclusion('all')], deactivate: [RECURRING] })).rejects.toThrow();
      expect((await db.query('SELECT active FROM recurring_individual_sessions')).rows[0]).toEqual({ active: true });
      expect((await db.query('SELECT available_lessons, reserved_lessons FROM lesson_packages')).rows[0])
        .toEqual({ available_lessons: 1, reserved_lessons: 1 });
      expect((await db.query('SELECT id FROM session_recurrence_exclusions')).rows).toEqual([]);
      expect((await db.query('SELECT id FROM sessions')).rows).toEqual([{ id: sessionId(1) }]);
    } finally { await db.exec('DROP TABLE deletion_blocker;'); }
  });

  it('rejects a family cancellation race or unfinished refund before removing any data', async () => {
    await insertSession(1);
    await expect(remove([1], { family: true })).rejects.toThrow('Only settled cancelled lessons');
    await db.exec(`UPDATE sessions SET status = 'cancelled', penalty_resolution = 'pending' WHERE id = '${sessionId(1)}';`);
    await expect(remove([1], { family: true })).rejects.toThrow('Only settled cancelled lessons');
    expect((await db.query('SELECT id FROM sessions')).rows).toEqual([{ id: sessionId(1) }]);
  });

  it('retains consumed pooled credit evidence so the existing recount trigger cannot refund it', async () => {
    await db.exec(`INSERT INTO lesson_packages(id, pool_organization_id, total_lessons, available_lessons, reserved_lessons, completed_lessons) VALUES ('${PACKAGE}', '${POOL_ORG}', 6, 6, 0, 0);`);
    await insertSession(1, { lesson_package_id: PACKAGE });
    await insertSession(2, { lesson_package_id: PACKAGE, status: 'cancelled' });
    await insertSession(3, { lesson_package_id: PACKAGE, status: 'cancelled', is_late_cancelled: true, penalty_resolution: 'paid' });
    await insertSession(4, { lesson_package_id: PACKAGE, status: 'completed' });
    expect(new Set((await remove([1, 2, 3, 4], { protect: false })).map((row) => row.id)))
      .toEqual(new Set([sessionId(1), sessionId(2)]));
    expect((await db.query('SELECT available_lessons, reserved_lessons, completed_lessons FROM lesson_packages')).rows[0])
      .toEqual({ available_lessons: 4, reserved_lessons: 0, completed_lessons: 2 });
    await expect(remove([3], { protect: false })).rejects.toThrow('retained as payment history');
  });

  it('rejects a changed recurring teacher and grants destructive access only to the service role', async () => {
    await insertSession(1, { recurring_session_id: RECURRING });
    await db.exec(`UPDATE recurring_individual_sessions SET tutor_id = '${OTHER_TUTOR}';`);
    await expect(remove([1], { exclusions: [exclusion('all')] })).rejects.toThrow('recurring teacher changed');
    const privilege = (await db.query(`SELECT
      has_function_privilege('authenticated', 'delete_sessions_with_recurrence(uuid[],jsonb,uuid[],boolean,boolean,uuid[],uuid)', 'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role', 'delete_sessions_with_recurrence(uuid[],jsonb,uuid[],boolean,boolean,uuid[],uuid)', 'EXECUTE') AS service_execute,
      has_table_privilege('authenticated', 'session_recurrence_exclusions', 'SELECT') AS authenticated_select`)).rows[0];
    expect(privilege).toEqual({ authenticated_execute: false, service_execute: true, authenticated_select: false });
  });

  it('rejects reassigned standalone teacher or child rows after the API permission check', async () => {
    await insertSession(1, { tutor_id: OTHER_TUTOR });
    await expect(remove([1])).rejects.toThrow('lesson teacher changed');
    await insertSession(2, { student_id: OTHER_STUDENT, status: 'cancelled' });
    await expect(remove([2], { family: true })).rejects.toThrow('lesson student changed');
    expect((await db.query('SELECT id FROM sessions ORDER BY id')).rows).toEqual([{ id: sessionId(1) }, { id: sessionId(2) }]);
  });

  it('preserves a provisional cancellation for every role while bulk cleanup can delete other lessons', async () => {
    await insertSession(1, { status: 'cancelled', penalty_resolution: 'pending', cancellation_penalty_amount: null });
    await expect(remove([1], { protect: false })).rejects.toThrow('Cancellation is still being processed');
    await expect(remove([1], { family: true })).rejects.toThrow('Cancellation is still being processed');
    await insertSession(2, { status: 'cancelled' });
    expect((await remove([1, 2])).map((row) => row.id)).toEqual([sessionId(2)]);
    expect((await db.query('SELECT id FROM sessions')).rows).toEqual([{ id: sessionId(1) }]);
  });
});
