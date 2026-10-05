// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE profiles(id uuid PRIMARY KEY REFERENCES auth.users, email_notification_opt_out text[] DEFAULT '{}');
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE REFERENCES auth.users,
      email text, disable_lesson_reminders boolean DEFAULT false);
    CREATE TABLE email_reminder_opt_outs(email text PRIMARY KEY, opted_out_at timestamptz, source text);
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${uid(1)}'),('${uid(2)}');
    INSERT INTO profiles VALUES ('${uid(1)}', ARRAY['lesson_reminder_tutor', 'unrelated_setting']);
    INSERT INTO parent_profiles VALUES ('${uid(12)}','${uid(2)}','parent@example.test',true);
  `);
  await db.exec(readFileSync('supabase/migrations/20260914143000_parent_notification_preferences.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261005133416_user_notification_preferences.sql', 'utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });

async function asUser(user: number | null, sql: string, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ? uid(user) : '']);
    return (await db.query(sql)).rows;
  } finally { await db.exec('RESET ROLE'); }
}
describe('personal notification database access and persistence', () => {
  it('updates one category at a time and preserves other choices and legacy fields', async () => {
    await asUser(1, "SELECT set_user_notification_preference('messages', false)");
    await asUser(1, "SELECT set_user_notification_preference('lesson_reminders', true)");
    const rows = await asUser(1, 'SELECT category,enabled FROM user_notification_preferences ORDER BY category');
    expect(rows).toEqual([{ category: 'lesson_reminders', enabled: true }, { category: 'messages', enabled: false }]);
    expect((await db.query('SELECT email_notification_opt_out FROM profiles')).rows)
      .toEqual([{ email_notification_opt_out: ['unrelated_setting'] }]);
    await asUser(1, "SELECT set_user_notification_preference('lesson_reminders', false)");
    expect((await db.query('SELECT email_notification_opt_out FROM profiles')).rows)
      .toEqual([{ email_notification_opt_out: ['unrelated_setting', 'lesson_reminder_tutor'] }]);
  });
  it('synchronizes parent reminder unsubscribe state atomically', async () => {
    await asUser(2, "SELECT set_user_notification_preference('lesson_reminders', true)");
    expect((await db.query('SELECT disable_lesson_reminders FROM parent_profiles')).rows)
      .toEqual([{ disable_lesson_reminders: false }]);
    expect((await db.query('SELECT email FROM email_reminder_opt_outs')).rows).toEqual([]);
    await asUser(2, "SELECT set_user_notification_preference('lesson_reminders', false)");
    expect((await db.query('SELECT email FROM email_reminder_opt_outs')).rows).toEqual([{ email: 'parent@example.test' }]);
  });
  it('isolates users through RLS and denies direct row mutations and anonymous access', async () => {
    expect(await asUser(2, `SELECT category FROM user_notification_preferences WHERE user_id='${uid(1)}'`)).toEqual([]);
    await expect(asUser(2, `UPDATE user_notification_preferences SET enabled=true WHERE user_id='${uid(1)}'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(2, `INSERT INTO user_notification_preferences VALUES('${uid(1)}','product_updates',false,now())`)).rejects.toThrow(/permission denied/);
    await expect(asUser(null, 'SELECT * FROM user_notification_preferences', 'anon')).rejects.toThrow(/permission denied/);
    await expect(asUser(null, "SELECT set_user_notification_preference('messages',false)", 'anon')).rejects.toThrow(/permission denied/);
  });
  it('requires auth and rejects unknown or required notification categories', async () => {
    await expect(asUser(null, "SELECT set_user_notification_preference('messages',false)")).rejects.toThrow(/Authentication required/);
    for (const key of ['unknown', 'school_monthly_invoice', 'payment_success']) {
      await expect(asUser(1, `SELECT set_user_notification_preference('${key}',false)`)).rejects.toThrow(/Unknown notification preference/);
    }
  });
});
