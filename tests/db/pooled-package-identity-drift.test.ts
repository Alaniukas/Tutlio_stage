// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const ORG = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
const OTHER_ORG = '00000000-0000-4000-8000-000000000009';
const STUDENT = '00000000-0000-4000-8000-000000000001';
const OTHER_STUDENT = '00000000-0000-4000-8000-000000000002';
const TUTOR = '00000000-0000-4000-8000-000000000003';
const OTHER_TUTOR = '00000000-0000-4000-8000-000000000004';
const SUBJECT = '00000000-0000-4000-8000-000000000005';
const PACKAGE = '00000000-0000-4000-8000-000000000006';
const SESSION = '00000000-0000-4000-8000-000000000007';
const LINKED_USER = '00000000-0000-4000-8000-000000000008';
const OTHER_LINKED_USER = '00000000-0000-4000-8000-000000000010';
const PENDING_SESSION = '00000000-0000-4000-8000-000000000011';
const SECOND_TUTOR = '00000000-0000-4000-8000-000000000012';
const SIBLING_STUDENT_ROW = '00000000-0000-4000-8000-000000000013';
const SECOND_SUBJECT = '00000000-0000-4000-8000-000000000014';
const MULTI_SESSION_A = '00000000-0000-4000-8000-000000000015';
const MULTI_SESSION_B = '00000000-0000-4000-8000-000000000016';

function migrationSection(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Pooled package migration section missing: ${start}`);
  return source.slice(from, to);
}

it('lets an allocated lesson be confirmed and commented after student identity changes without reopening package allocation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE students (
        id uuid PRIMARY KEY, tutor_id uuid, organization_id uuid, linked_user_id uuid, email text,
        full_name text, detached_at timestamptz
      );
      CREATE TABLE profiles (id uuid PRIMARY KEY, organization_id uuid);
      CREATE TABLE organization_admins (organization_id uuid, user_id uuid);
      CREATE TABLE subjects (id uuid PRIMARY KEY, tutor_id uuid, is_trial boolean DEFAULT false);
      CREATE TABLE lesson_packages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id uuid, student_id uuid,
        subject_id uuid, pool_organization_id uuid,
        pool_identity_key text, total_lessons integer, available_lessons integer,
        reserved_lessons integer, completed_lessons integer, price_per_lesson numeric,
        total_price numeric, paid boolean, payment_status text, active boolean, payment_method text,
        expires_at timestamptz, billing_period_start date, billing_period_end date,
        updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(),
        CHECK (available_lessons >= 0)
      );
      CREATE TABLE lesson_package_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid, subject_id uuid,
        total_lessons integer, available_lessons integer, reserved_lessons integer,
        completed_lessons integer, price_per_lesson numeric, total_price numeric, position integer
      );
      CREATE TABLE pooled_package_quotes (
        package_id uuid PRIMARY KEY, preview_token text, session_ids uuid[],
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE sessions (
        id uuid PRIMARY KEY, student_id uuid, tutor_id uuid, subject_id uuid,
        lesson_package_id uuid REFERENCES lesson_packages(id), start_time timestamptz,
        status text, paid boolean DEFAULT false, payment_status text, price numeric DEFAULT 30,
        is_complimentary boolean DEFAULT false, is_makeup boolean DEFAULT false,
        is_late_cancelled boolean DEFAULT false, tutor_comment text,
        status_reminder_last_sent_at timestamptz, status_confirmed_at timestamptz,
        status_confirmed_by uuid
      );
    `);

    const pooled = readFileSync('supabase/migrations/20260910174000_org_student_pooled_packages.sql', 'utf8');
    await db.exec(migrationSection(pooled,
      'CREATE OR REPLACE FUNCTION public.package_student_identity(',
      'CREATE OR REPLACE FUNCTION public.create_org_student_package('));
    await db.exec(migrationSection(pooled,
      'CREATE OR REPLACE FUNCTION public.protect_pooled_package()',
      'CREATE OR REPLACE FUNCTION public.allocate_pooled_session()'));
    await db.exec(migrationSection(pooled,
      'CREATE OR REPLACE FUNCTION public.allocate_pooled_session()',
      'CREATE OR REPLACE FUNCTION public.recount_pooled_session()'));
    await db.exec(migrationSection(pooled,
      'CREATE OR REPLACE FUNCTION public.recount_pooled_session()',
      '-- On confirmed payment apply the pool'));
    await db.exec(migrationSection(pooled,
      'CREATE FUNCTION public.get_pooled_packages_for_student(p_student_id uuid)',
      'CREATE OR REPLACE FUNCTION public.protect_pooled_package_items()'));
    await db.exec(migrationSection(pooled,
      'CREATE OR REPLACE FUNCTION public.apply_paid_pooled_package()',
      'DROP POLICY IF EXISTS pooled_package_member_read'));

    await db.query(`INSERT INTO students(id, tutor_id, organization_id, linked_user_id, email, full_name)
      VALUES ($1, $2, $3, NULL, $4, $5), ($6, $2, $3, $7, $4, $5)`,
    [STUDENT, TUTOR, ORG, 'child@example.test', 'Student', OTHER_STUDENT, OTHER_LINKED_USER]);
    await db.query('INSERT INTO profiles(id, organization_id) VALUES ($1, $2), ($3, $4)',
      [TUTOR, ORG, OTHER_TUTOR, OTHER_ORG]);
    await db.query('INSERT INTO subjects(id, tutor_id, is_trial) VALUES ($1, $2, false)', [SUBJECT, TUTOR]);
    const originalIdentity = (await db.query<{ identity: string }>(
      'SELECT package_student_identity(s) AS identity FROM students s WHERE id = $1', [STUDENT],
    )).rows[0].identity;
    await db.query(`INSERT INTO lesson_packages (
      id, tutor_id, student_id, pool_organization_id, pool_identity_key, total_lessons,
      available_lessons, reserved_lessons, completed_lessons, price_per_lesson, total_price,
      paid, payment_status, active, expires_at, billing_period_start, billing_period_end
    ) VALUES ($1, $2, $3, $4, $5, 2, 2, 0, 0, 30, 60, true, 'paid', true,
      '2099-10-01', '2099-09-01', '2099-09-30')`,
      [PACKAGE, TUTOR, STUDENT, ORG, originalIdentity]);
    await db.query(`INSERT INTO sessions (
      id, student_id, tutor_id, subject_id, lesson_package_id, start_time, status
    ) VALUES ($1, $2, $3, $4, $5, '2099-09-28T18:00:00Z', 'active')`,
      [SESSION, STUDENT, TUTOR, SUBJECT, PACKAGE]);
    const counters = async () => (await db.query<{
      available_lessons: number; reserved_lessons: number; completed_lessons: number;
    }>('SELECT available_lessons, reserved_lessons, completed_lessons FROM lesson_packages WHERE id = $1',
    [PACKAGE])).rows[0];
    expect(await counters()).toEqual({ available_lessons: 1, reserved_lessons: 1, completed_lessons: 0 });
    expect((await db.query('SELECT id FROM get_pooled_packages_for_student($1)', [STUDENT])).rows)
      .toEqual([{ id: PACKAGE }]);

    // Account linking changes the identity hash without changing an allocated lesson.
    await db.query('UPDATE students SET linked_user_id = $1 WHERE id = $2', [LINKED_USER, STUDENT]);
    const linkedIdentity = (await db.query<{ identity: string }>(
      'SELECT package_student_identity(s) AS identity FROM students s WHERE id = $1', [STUDENT],
    )).rows[0].identity;
    expect(linkedIdentity).not.toBe(originalIdentity);
    expect((await db.query('SELECT id FROM get_pooled_packages_for_student($1)', [STUDENT])).rows).toEqual([]);

    // This is the current production failure: all three independent writes are blocked.
    const blockedWrites: Array<[string, string[]]> = [
      ["UPDATE sessions SET status = 'completed', status_confirmed_at = now(), status_confirmed_by = $2 WHERE id = $1", [SESSION, LINKED_USER]],
      ["UPDATE sessions SET tutor_comment = 'Lesson note' WHERE id = $1", [SESSION]],
      ["UPDATE sessions SET status_reminder_last_sent_at = now() WHERE id = $1", [SESSION]],
    ];
    for (const [sql, values] of blockedWrites) {
      await expect(db.query(sql, values)).rejects.toThrow('Session outside package identity or organization');
    }
    expect(await counters()).toEqual({ available_lessons: 1, reserved_lessons: 1, completed_lessons: 0 });

    await db.exec(readFileSync('supabase/migrations/20260929180153_pooled_package_identity_drift.sql', 'utf8'));
    expect((await db.query('SELECT id FROM get_pooled_packages_for_student($1)', [STUDENT])).rows)
      .toEqual([{ id: PACKAGE }]);
    expect((await db.query('SELECT id FROM get_pooled_packages_for_student($1)', [OTHER_STUDENT])).rows)
      .toEqual([]);
    await db.query("UPDATE sessions SET tutor_comment = 'Lesson note' WHERE id = $1", [SESSION]);
    await db.query('UPDATE sessions SET status_reminder_last_sent_at = now() WHERE id = $1', [SESSION]);
    await db.query("UPDATE sessions SET status = 'completed', status_confirmed_at = now(), status_confirmed_by = $2 WHERE id = $1",
      [SESSION, LINKED_USER]);
    expect((await db.query<{
      status: string; tutor_comment: string; stamped: boolean; confirmed: boolean;
    }>(`SELECT status, tutor_comment,
      status_reminder_last_sent_at IS NOT NULL AS stamped,
      status_confirmed_at IS NOT NULL AS confirmed
      FROM sessions WHERE id = $1`, [SESSION])).rows[0]).toEqual({
      status: 'completed', tutor_comment: 'Lesson note', stamped: true, confirmed: true,
    });
    expect(await counters()).toEqual({ available_lessons: 1, reserved_lessons: 0, completed_lessons: 1 });

    // Restoring the original identity isolates reassignment checks from drift.
    await db.query('UPDATE students SET linked_user_id = NULL WHERE id = $1', [STUDENT]);
    expect((await db.query('SELECT id FROM get_pooled_packages_for_student($1)', [OTHER_STUDENT])).rows)
      .toEqual([]);
    await expect(db.query('UPDATE sessions SET student_id = $2 WHERE id = $1',
      [SESSION, OTHER_STUDENT])).rejects.toThrow('Session outside package identity or organization');
    await expect(db.query('UPDATE sessions SET tutor_id = $2 WHERE id = $1',
      [SESSION, OTHER_TUTOR])).rejects.toThrow('Session outside package identity or organization');
    expect(await counters()).toEqual({ available_lessons: 1, reserved_lessons: 0, completed_lessons: 1 });

    // A pending email-key offer remains the same offer after account linking.
    await db.query(`INSERT INTO sessions (id, student_id, tutor_id, subject_id, start_time, status)
      VALUES ($1, $2, $3, $4, '2099-11-15T18:00:00Z', 'active')`,
    [PENDING_SESSION, STUDENT, TUTOR, SUBJECT]);
    const createOffer = (previewToken: string) => db.query<{ id: string }>(
      `SELECT create_org_student_package(
        $1::uuid, $2::uuid, $3::uuid[], $4::jsonb, $5::numeric,
        $6::date, $7::date, $8::text, $9::uuid[]
      ) AS id`,
      [STUDENT, ORG, [STUDENT], JSON.stringify([{ subjectId: SUBJECT, totalLessons: 1, pricePerLesson: 32 }]),
        null, '2099-11-01', '2099-11-30', previewToken, [PENDING_SESSION]],
    );
    const pendingPackageId = (await createOffer('original-preview')).rows[0].id;
    await db.query('UPDATE students SET linked_user_id = $1 WHERE id = $2', [LINKED_USER, STUDENT]);
    expect((await createOffer('original-preview')).rows[0].id).toBe(pendingPackageId);
    await expect(createOffer('different-preview')).rejects.toThrow('A package already exists for this student and period');

    // Payment after linking must attach the quoted lesson and preserve its item price.
    await db.query("UPDATE lesson_packages SET paid = true, payment_status = 'paid' WHERE id = $1", [pendingPackageId]);
    expect((await db.query<{
      lesson_package_id: string; paid: boolean; payment_status: string; price: string;
    }>('SELECT lesson_package_id, paid, payment_status, price::text FROM sessions WHERE id = $1',
    [PENDING_SESSION])).rows[0]).toEqual({
      lesson_package_id: pendingPackageId, paid: true, payment_status: 'paid', price: '32',
    });
    expect((await db.query('SELECT available_lessons, reserved_lessons, completed_lessons FROM lesson_packages WHERE id = $1',
      [pendingPackageId])).rows[0]).toEqual({ available_lessons: 0, reserved_lessons: 1, completed_lessons: 0 });

    // The same child can have one student row per tutor. Linking just the anchor
    // after an offer was sent must not make a retry create a second pooled sale.
    await db.query('UPDATE students SET linked_user_id = NULL WHERE id = $1', [STUDENT]);
    await db.query('INSERT INTO profiles(id, organization_id) VALUES ($1, $2)', [SECOND_TUTOR, ORG]);
    await db.query(`INSERT INTO students (id, tutor_id, organization_id, email, full_name)
      VALUES ($1, $2, $3, 'child@example.test', 'Student')`,
    [SIBLING_STUDENT_ROW, SECOND_TUTOR, ORG]);
    await db.query('INSERT INTO subjects(id, tutor_id, is_trial) VALUES ($1, $2, false)',
      [SECOND_SUBJECT, SECOND_TUTOR]);
    await db.query(`INSERT INTO sessions (id, student_id, tutor_id, subject_id, start_time, status)
      VALUES ($1, $2, $3, $4, '2099-12-15T18:00:00Z', 'active'),
             ($5, $6, $7, $8, '2099-12-16T18:00:00Z', 'active')`,
    [MULTI_SESSION_A, STUDENT, TUTOR, SUBJECT,
      MULTI_SESSION_B, SIBLING_STUDENT_ROW, SECOND_TUTOR, SECOND_SUBJECT]);
    const createTwoTutorOffer = (previewToken: string) => db.query<{ id: string }>(
      `SELECT create_org_student_package(
        $1::uuid, $2::uuid, $3::uuid[], $4::jsonb, $5::numeric,
        $6::date, $7::date, $8::text, $9::uuid[]
      ) AS id`,
      [STUDENT, ORG, [STUDENT, SIBLING_STUDENT_ROW], JSON.stringify([
        { subjectId: SUBJECT, totalLessons: 1, pricePerLesson: 30 },
        { subjectId: SECOND_SUBJECT, totalLessons: 1, pricePerLesson: 35 },
      ]), null, '2099-12-01', '2099-12-31', previewToken, [MULTI_SESSION_A, MULTI_SESSION_B]],
    );
    const twoTutorPackageId = (await createTwoTutorOffer('two-tutor-preview')).rows[0].id;
    await db.query('UPDATE students SET linked_user_id = $1 WHERE id = $2', [LINKED_USER, STUDENT]);
    expect((await createTwoTutorOffer('two-tutor-preview')).rows[0].id).toBe(twoTutorPackageId);
    await expect(createTwoTutorOffer('different-two-tutor-preview'))
      .rejects.toThrow('A package already exists for this student and period');
    await db.query("UPDATE lesson_packages SET paid = true, payment_status = 'paid' WHERE id = $1", [twoTutorPackageId]);
    expect((await db.query<{ id: string; lesson_package_id: string; price: string }>(
      'SELECT id, lesson_package_id, price::text FROM sessions WHERE id IN ($1, $2) ORDER BY id',
      [MULTI_SESSION_A, MULTI_SESSION_B],
    )).rows).toEqual([
      { id: MULTI_SESSION_A, lesson_package_id: twoTutorPackageId, price: '30' },
      { id: MULTI_SESSION_B, lesson_package_id: twoTutorPackageId, price: '35' },
    ]);
  } finally {
    await db.close();
  }
}, 30_000);
