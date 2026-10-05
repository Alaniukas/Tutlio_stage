// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const sessionId = '00000000-0000-4000-8000-000000000101';
const originalStart = '2026-09-29T16:00:00.000Z';
const movedStart = '2026-10-01T16:00:00.000Z';

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE sessions (
      id uuid PRIMARY KEY,
      start_time timestamptz NOT NULL,
      end_time timestamptz NOT NULL,
      reminder_student_sent boolean NOT NULL DEFAULT false,
      reminder_payer_sent boolean NOT NULL DEFAULT false,
      reminder_tutor_sent boolean NOT NULL DEFAULT false
    );
    INSERT INTO sessions (
      id, start_time, end_time,
      reminder_student_sent, reminder_payer_sent, reminder_tutor_sent
    ) VALUES (
      '${sessionId}', '${originalStart}', '${originalStart}'::timestamptz + interval '60 minutes',
      true, true, true
    );
  `);
  await db.exec(readFileSync('supabase/migrations/20261005120000_session_reminder_reset_on_reschedule.sql', 'utf8'));
  return db;
}

it('clears reminder flags when a session time is moved through a direct UPDATE', async () => {
  const db = await database();
  try {
    await db.query(
      `UPDATE sessions
       SET start_time = $1,
           end_time = $1::timestamptz + interval '60 minutes'
       WHERE id = $2`,
      [movedStart, sessionId],
    );

    const row = (await db.query<{
      reminder_student_sent: boolean;
      reminder_payer_sent: boolean;
      reminder_tutor_sent: boolean;
    }>('SELECT reminder_student_sent, reminder_payer_sent, reminder_tutor_sent FROM sessions WHERE id = $1', [sessionId])).rows[0];

    expect(row).toEqual({
      reminder_student_sent: false,
      reminder_payer_sent: false,
      reminder_tutor_sent: false,
    });
  } finally {
    await db.close();
  }
});

it('keeps reminder flags when only non-time fields change', async () => {
  const db = await database();
  try {
    await db.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meeting_link text');
    await db.query('UPDATE sessions SET meeting_link = $1 WHERE id = $2', ['https://meet.google.com/test', sessionId]);

    const row = (await db.query<{
      reminder_student_sent: boolean;
      reminder_payer_sent: boolean;
      reminder_tutor_sent: boolean;
    }>('SELECT reminder_student_sent, reminder_payer_sent, reminder_tutor_sent FROM sessions WHERE id = $1', [sessionId])).rows[0];

    expect(row).toEqual({
      reminder_student_sent: true,
      reminder_payer_sent: true,
      reminder_tutor_sent: true,
    });
  } finally {
    await db.close();
  }
});
