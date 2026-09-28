// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const currentMigration = readFileSync('supabase/migrations/20260908080306_school_reminder_recipient_parity.sql', 'utf8');
const compactMigration = readFileSync('supabase/migrations/20260928180200_school_compact_reminder_recipient_parity.sql', 'utf8');
const sessionId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

async function reminderDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.organizations(id text PRIMARY KEY, entity_type text, features jsonb);
    CREATE TABLE public.profiles(
      id text PRIMARY KEY, organization_id text, email text,
      reminder_student_hours numeric, reminder_tutor_hours numeric
    );
    CREATE TABLE public.students(
      id text PRIMARY KEY, organization_id text, payment_payer text,
      email text, payer_email text, parent_secondary_email text
    );
    CREATE TABLE public.parent_profiles(id text PRIMARY KEY, email text, disable_lesson_reminders boolean);
    CREATE TABLE public.parent_students(student_id text, parent_id text);
    CREATE TABLE public.sessions(
      id uuid PRIMARY KEY, tutor_id text, student_id text, start_time timestamptz, status text,
      reminder_student_sent boolean, reminder_tutor_sent boolean, reminder_payer_sent boolean
    );
  `);
  await db.exec(currentMigration);
  return db;
}

type ReminderCase = {
  entityType?: string;
  features?: Record<string, unknown>;
  studentEmail?: string;
  payerEmail?: string;
  secondaryEmail?: string;
  parentEmail?: string;
  parentDisabled?: boolean | null;
  linkedParent?: boolean;
  studentSent?: boolean;
  tutorSent?: boolean;
  payerSent?: boolean;
  studentHours?: number | null;
  startMinutes?: number;
  startTime?: string;
  status?: string;
};

async function seedReminder(db: PGlite, index: number, options: ReminderCase = {}) {
  const organization = `organization-${index}`;
  const tutor = `tutor-${index}`;
  const student = `student-${index}`;
  const parent = `parent-${index}`;
  await db.query('INSERT INTO organizations VALUES ($1, $2, $3::jsonb)', [
    organization, options.entityType ?? 'school',
    JSON.stringify(options.features ?? { school_compact_notifications: true, flexible_invitations: false }),
  ]);
  await db.query('INSERT INTO profiles VALUES ($1, $2, $3, $4, 2)', [
    tutor, organization, `${tutor}@example.test`, options.studentHours === undefined ? 2 : options.studentHours,
  ]);
  await db.query("INSERT INTO students VALUES ($1, $2, 'student', $3, $4, $5)", [
    student, organization, options.studentEmail ?? '', options.payerEmail ?? '', options.secondaryEmail ?? '',
  ]);
  await db.query('INSERT INTO parent_profiles VALUES ($1, $2, $3)', [
    parent, options.parentEmail ?? `${parent}@example.test`, options.parentDisabled === undefined ? false : options.parentDisabled,
  ]);
  await db.query('INSERT INTO parent_students VALUES ($1, $2)', [
    options.linkedParent === false ? `another-${student}` : student, parent,
  ]);
  await db.query(`
    INSERT INTO sessions VALUES (
      $1, $2, $3,
      COALESCE($4::timestamptz, now() + $5::double precision * interval '1 minute'),
      $6, $7, $8, $9
    )
  `, [
    sessionId(index), tutor, student, options.startTime ?? null, options.startMinutes ?? 30,
    options.status ?? 'active', options.studentSent ?? true, options.tutorSent ?? true, options.payerSent ?? false,
  ]);
}

async function dueIds(db: PGlite, limit?: number | null) {
  const result = limit === undefined
    ? await db.query<{ id: string }>('SELECT id::text FROM public.get_due_session_reminder_ids()')
    : await db.query<{ id: string }>('SELECT id::text FROM public.get_due_session_reminder_ids($1)', [limit]);
  return result.rows.map(row => row.id);
}

it('adds compact-only registered parents while preserving disabled, absent, company, and legacy cases', async () => {
  const db = await reminderDatabase();
  try {
    await seedReminder(db, 1);
    await seedReminder(db, 2, { features: { school_compact_notifications: false } });
    await seedReminder(db, 3, { features: {} });
    await seedReminder(db, 4, { entityType: 'company' });
    await seedReminder(db, 5, { features: { school_compact_notifications: 'true' } });
    await seedReminder(db, 6, { parentDisabled: true });
    await seedReminder(db, 7, { linkedParent: false });
    await seedReminder(db, 8, { parentEmail: '   ' });
    await seedReminder(db, 9, { parentDisabled: null });
    await seedReminder(db, 10, { studentEmail: 'child@example.test' });
    await seedReminder(db, 11, { features: { flexible_invitations: true } });
    await seedReminder(db, 12, { features: {}, payerEmail: 'payer@example.test' });
    await seedReminder(db, 13, { features: {}, secondaryEmail: 'second@example.test' });
    await seedReminder(db, 14, { features: {}, studentEmail: 'child@example.test', studentSent: false });
    await seedReminder(db, 15, { features: {}, tutorSent: false });
    await seedReminder(db, 16, { studentEmail: ' ', payerEmail: ' ', secondaryEmail: ' ' });
    const legacyIds = [11, 12, 13, 14, 15].map(sessionId);
    expect((await dueIds(db)).sort()).toEqual(legacyIds);

    await db.exec(compactMigration);

    expect((await dueIds(db)).sort()).toEqual([1, 11, 12, 13, 14, 15, 16].map(sessionId));
  } finally {
    await db.close();
  }
}, 30_000);

it('keeps the existing time windows, reminder flags, and disabled-hours boundaries', async () => {
  const db = await reminderDatabase();
  try {
    await db.exec(compactMigration);
    await seedReminder(db, 1);
    await seedReminder(db, 2, { startMinutes: 60 });
    await seedReminder(db, 3, { startMinutes: 150 });
    await seedReminder(db, 4, { startMinutes: -5 });
    await seedReminder(db, 5, { startMinutes: 72 * 60 + 1, studentHours: 100 });
    await seedReminder(db, 6, { status: 'cancelled' });
    await seedReminder(db, 7, { payerSent: true });
    await seedReminder(db, 8, { studentHours: 0 });
    await seedReminder(db, 9, { studentHours: -1 });
    await seedReminder(db, 10, { studentHours: null });

    expect((await dueIds(db)).sort()).toEqual([1, 2, 10].map(sessionId).sort());
  } finally {
    await db.close();
  }
}, 30_000);

it('preserves deterministic ordering, bounded batches, and service-role-only execution', async () => {
  const db = await reminderDatabase();
  try {
    await db.exec(compactMigration);
    const firstSlot = new Date(Date.now() + 30 * 60_000).toISOString();
    const laterSlot = new Date(Date.now() + 60 * 60_000).toISOString();
    await seedReminder(db, 3, { startTime: firstSlot });
    await seedReminder(db, 1, { startTime: laterSlot });
    await seedReminder(db, 2, { startTime: firstSlot });
    expect(await dueIds(db)).toEqual([2, 3, 1].map(sessionId));

    await db.exec(`
      TRUNCATE sessions;
      INSERT INTO sessions
      SELECT ('00000000-0000-4000-8000-' || lpad(index::text, 12, '0'))::uuid,
        'tutor-1', 'student-1', now() + interval '30 minutes', 'active', true, true, false
      FROM generate_series(1, 1005) AS index;
    `);
    expect(await dueIds(db, 2)).toEqual([1, 2].map(sessionId));
    expect(await dueIds(db, 0)).toEqual([sessionId(1)]);
    expect(await dueIds(db, -1)).toEqual([sessionId(1)]);
    expect(await dueIds(db)).toHaveLength(250);
    expect(await dueIds(db, null)).toHaveLength(250);
    expect(await dueIds(db, 2000)).toHaveLength(1000);
    const permissions = await db.query(`
      SELECT has_function_privilege('anon', 'public.get_due_session_reminder_ids(integer)', 'EXECUTE') AS anon,
        has_function_privilege('authenticated', 'public.get_due_session_reminder_ids(integer)', 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', 'public.get_due_session_reminder_ids(integer)', 'EXECUTE') AS service_role
    `);
    expect(permissions.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
    const functionSettings = await db.query<{ prosecdef: boolean; provolatile: string; proconfig: string[] }>(`
      SELECT prosecdef, provolatile, proconfig FROM pg_proc
      WHERE oid = 'public.get_due_session_reminder_ids(integer)'::regprocedure
    `);
    expect(functionSettings.rows[0]).toMatchObject({ prosecdef: true, provolatile: 's' });
    expect(functionSettings.rows[0].proconfig).toContain('row_security=off');
    expect(functionSettings.rows[0].proconfig).toContain('search_path=""');
  } finally {
    await db.close();
  }
}, 30_000);
