// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/tutor-calendar-series-edit';
import { editTutorCalendarSeries } from '../../src/lib/tutorCalendarSeriesEdit';
import { buildRollingOccurrenceDates, wallClockToUtc } from '../../api/_lib/recurringOccurrences';

vi.mock('../../src/lib/authSession', () => ({ resolveAccessToken: async () => 'tutor-token' }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tutor = id(1), child = id(2), subject = id(3), recurring = id(4), lesson = id(5), next = id(6), org = id(7);
const later = id(8), otherTutor = id(9), otherSeries = id(10), peer = id(11);
const oldStart = '2030-10-22T10:00:00.000Z', oldEnd = '2030-10-22T11:00:00.000Z';
const newStart = '2030-10-23T12:00:00.000Z', newEnd = '2030-10-23T13:00:00.000Z';
let db: PGlite;
let rpcCalls: Array<Record<string, unknown>>;
let deniedToken = false;

function response() {
  const result = { status: 0, body: {} as any, headers: {} as Record<string, string> };
  const res: any = {
    setHeader: (key: string, value: string) => { result.headers[key] = value; },
    status: (status: number) => { result.status = status; return res; },
    json: (body: unknown) => { result.body = body; return res; },
  };
  return { res, result };
}
const input = () => ({ sessionId: lesson, recurringIds: [recurring], oldStart, oldEnd,
  newStart, newEnd, fields: { topic: 'Algebra', meeting_link: 'https://meet.example/algebra' },
  reason: 'Keičiamas darbo grafikas', requestedBy: 'tutor',
});
async function request(body: Record<string, unknown>, method = 'POST', headers = { authorization: 'Bearer tutor-token' }) {
  const { res, result } = response();
  await handler({ method, body, query: {}, headers } as any, res);
  return result;
}
async function save(overrides: Partial<Parameters<typeof editTutorCalendarSeries>[0]> = {}) {
  return editTutorCalendarSeries({ sessionId: lesson, recurringIds: [recurring],
    oldStart: new Date(oldStart), oldEnd: new Date(oldEnd), start: new Date(newStart), end: new Date(newEnd),
    fields: input().fields, reason: input().reason, requestedBy: 'tutor', ...overrides,
  });
}
async function snapshot() {
  const { rows } = await db.query(`SELECT jsonb_build_object(
    'sessions', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM sessions s),
    'templates', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM recurring_individual_sessions r),
    'exclusions', (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM session_recurrence_exclusions e)) AS value`);
  return (rows[0] as any).value;
}
async function template(seriesId = recurring) {
  return (await db.query<any>('SELECT to_jsonb(r) AS value FROM recurring_individual_sessions r WHERE id=$1', [seriesId])).rows[0].value;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE organizations (id uuid PRIMARY KEY, entity_type text DEFAULT 'company', features jsonb, status text DEFAULT 'active');
    CREATE TABLE profiles (id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE subjects (id uuid PRIMARY KEY, is_group boolean DEFAULT false);
    CREATE TABLE students (id uuid PRIMARY KEY, organization_id uuid, full_name text,
      payer_email text, email text, payment_payer text DEFAULT 'parent', parent_user_id uuid);
    CREATE TABLE parent_profiles (user_id uuid, email text);
    CREATE TABLE session_recurrence_exclusions (id uuid DEFAULT gen_random_uuid(), recurring_session_id uuid,
      start_time timestamptz, scope text, student_id uuid, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX exclusions_unique ON session_recurrence_exclusions(recurring_session_id,scope,start_time);
    ALTER TABLE session_recurrence_exclusions ENABLE ROW LEVEL SECURITY;
    CREATE TABLE organization_admins (user_id uuid, organization_id uuid, status text, accepted_at timestamptz, role text, permissions jsonb);
    CREATE TABLE recurring_individual_sessions (id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, subject_id uuid,
      day_of_week integer, start_time time, end_time time, start_date date, end_date date, active boolean DEFAULT true,
      frequency text DEFAULT 'weekly', meeting_link text, topic text, price numeric,
      last_materialized_at timestamptz, updated_at timestamptz, created_at timestamptz);
    CREATE TABLE sessions (id uuid PRIMARY KEY, tutor_id uuid, student_id uuid, subject_id uuid, recurring_session_id uuid,
      class_group_id uuid, lesson_package_id uuid, start_time timestamptz, end_time timestamptz, status text DEFAULT 'active',
      original_start_time timestamptz, rescheduled_at timestamptz, reschedule_reason text, reschedule_requested_by text,
      topic text, meeting_link text, price numeric, tutor_comment text, show_comment_to_student boolean, show_comment_to_parent boolean);
    CREATE UNIQUE INDEX student_start ON sessions(tutor_id,student_id,start_time);
    INSERT INTO organizations(id, features) VALUES ('${org}', '{}');
  `);
  await db.exec(readFileSync('supabase/migrations/20261012104626_tutor_recurring_reschedule_approval.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261014132543_tutor_calendar_series_edit.sql', 'utf8'));
  await db.exec(`GRANT USAGE ON SCHEMA auth TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;`);
}, 30_000);

beforeEach(async () => {
  await db.exec(`RESET ROLE; DROP TRIGGER IF EXISTS test_fail_write ON sessions;
    TRUNCATE lesson_reschedule_requests, profiles, subjects, students, parent_profiles, organization_admins,
      recurring_individual_sessions, sessions, session_recurrence_exclusions CASCADE;
    UPDATE organizations SET features='{}', status='active';
    INSERT INTO profiles VALUES ('${tutor}', '${org}'), ('${otherTutor}', '${org}');
    INSERT INTO subjects(id) VALUES ('${subject}');
    INSERT INTO students(id, organization_id, full_name, payer_email) VALUES ('${child}', '${org}', 'Ada', 'parent@example.com');
    INSERT INTO recurring_individual_sessions(id,tutor_id,student_id,subject_id,day_of_week,start_time,end_time,start_date,price,topic)
      VALUES ('${recurring}','${tutor}','${child}','${subject}',2,'13:00','14:00','2030-10-22',20,'Math');
    INSERT INTO sessions(id,tutor_id,student_id,subject_id,recurring_session_id,start_time,end_time,price,topic) VALUES
      ('${lesson}','${tutor}','${child}','${subject}','${recurring}','${oldStart}','${oldEnd}',20,'Math'),
      ('${next}','${tutor}','${child}','${subject}','${recurring}','2030-10-29T11:00:00Z','2030-10-29T12:00:00Z',20,'Math'),
      ('${later}','${tutor}','${child}','${subject}','${recurring}','2030-11-05T11:00:00Z','2030-11-05T12:00:00Z',20,'Math');
    SET ROLE service_role;
  `);
  rpcCalls = []; deniedToken = false;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://calendar.test');
  vi.stubEnv('SUPABASE_URL', 'https://calendar.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (inputValue: string | URL | Request, init?: RequestInit) => {
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    const url = String(inputValue);
    if (url === '/api/tutor-calendar-series-edit') {
      const result = await request(JSON.parse(String(init?.body)), 'POST',
        { authorization: new Headers(init?.headers).get('Authorization') || '' });
      return reply(result.body, result.status);
    }
    if (url === 'https://calendar.test/auth/v1/user') {
      return deniedToken ? reply({ message: 'Invalid token' }, 401) : reply({ id: tutor, email: 'tutor@example.com' });
    }
    if (url === 'https://calendar.test/rest/v1/rpc/edit_tutor_calendar_series') {
      const p = JSON.parse(String(init?.body)); rpcCalls.push(p);
      try {
        const { rows } = await db.query<any>(`SELECT edit_tutor_calendar_series($1::uuid,$2::uuid,$3::uuid[],
          $4::timestamptz,$5::timestamptz,$6::timestamptz,$7::timestamptz,$8::jsonb,$9::text,$10::text) AS value`,
        [p.p_tutor,p.p_session,p.p_recurrence_ids,p.p_expected_start,p.p_expected_end,p.p_start,p.p_end,
          JSON.stringify(p.p_fields),p.p_reason,p.p_requested_by]);
        return reply(rows[0].value);
      } catch (error) {
        return reply({ message: (error as Error).message, code: 'P0001' }, 409);
      }
    }
    throw new Error(`Unexpected external request: ${url}`);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
afterAll(async () => { await db?.close(); });

describe('SUP-C3526529 browser → authenticated API → PostgreSQL recurring series edits', () => {
  it('keeps the local hour across DST and saves the template used by the rolling materializer', async () => {
    const saved = await save();
    expect(saved.map(row => new Date(row.start_time).toISOString()).sort()).toEqual([
      newStart, '2030-10-30T13:00:00.000Z', '2030-11-06T13:00:00.000Z',
    ]);
    const r = await template();
    expect(r).toMatchObject({ day_of_week: 3, start_time: '15:00:00', end_time: '16:00:00',
      end_date: null, topic: 'Algebra', meeting_link: 'https://meet.example/algebra' });
    const future = buildRollingOccurrenceDates(r, '2030-11-10', '2030-11-30')
      .map(date => wallClockToUtc(date, r.start_time).toISOString());
    expect(future).toEqual(['2030-11-13T13:00:00.000Z', '2030-11-20T13:00:00.000Z', '2030-11-27T13:00:00.000Z']);
  });

  it('edits every upcoming occurrence when the tutor opens a lesson in the middle of the series', async () => {
    await save({ sessionId: next, oldStart: new Date('2030-10-29T11:00:00Z'), oldEnd: new Date('2030-10-29T12:00:00Z'),
      start: new Date('2030-10-30T13:00:00Z'), end: new Date('2030-10-30T14:00:00Z') });
    const s = await snapshot();
    expect(new Date(s.sessions.find((row: any) => row.id === lesson).start_time).toISOString()).toBe(newStart);
    expect((await template()).start_date).toBe('2030-10-23');
  });

  it('persists metadata and price without changing any occurrence dates or recurrence anchors', async () => {
    const before = await snapshot();
    await save({ start: new Date(oldStart), end: new Date(oldEnd), reason: '',
      fields: { topic: 'Algebra', price: 30, tutor_comment: 'Prepare chapter 2', show_comment_to_student: true } });
    const after = await snapshot();
    expect(after.sessions.map((row: any) => row.start_time)).toEqual(before.sessions.map((row: any) => row.start_time));
    expect(after.sessions.every((row: any) => row.topic === 'Algebra' && row.price === 30 && row.show_comment_to_student)).toBe(true);
    expect(await template()).toMatchObject({ start_date: '2030-10-22', day_of_week: 2, topic: 'Algebra', price: 30 });
  });

  it('preserves past and completed lessons, other series and billing associations', async () => {
    await db.exec(`INSERT INTO sessions(id,tutor_id,student_id,subject_id,recurring_session_id,start_time,end_time,status) VALUES
      ('${id(20)}','${tutor}','${child}','${subject}','${recurring}','2020-10-22T10:00Z','2020-10-22T11:00Z','active'),
      ('${id(21)}','${tutor}','${child}','${subject}','${recurring}','2030-10-15T10:00Z','2030-10-15T11:00Z','completed'),
      ('${id(22)}','${tutor}','${child}','${subject}','${otherSeries}','2030-11-01T10:00Z','2030-11-01T11:00Z','active');
      UPDATE sessions SET lesson_package_id='${id(23)}' WHERE id='${lesson}';`);
    const before = await snapshot();
    await save(); const after = await snapshot();
    expect(after.sessions.filter((row: any) => [id(20),id(21),id(22)].includes(row.id)))
      .toEqual(before.sessions.filter((row: any) => [id(20),id(21),id(22)].includes(row.id)));
    expect(after.sessions.find((row: any) => row.id === lesson).lesson_package_id).toBe(id(23));
  });

  it('moves cancellations and deletion exclusions so the materializer cannot recreate removed lessons', async () => {
    await db.exec(`UPDATE sessions SET status='cancelled' WHERE id='${next}';
      INSERT INTO session_recurrence_exclusions(recurring_session_id,start_time,scope,student_id)
        VALUES ('${recurring}','2030-11-12T11:00Z','single','${child}');`);
    await save(); const after = await snapshot();
    const cancelled = after.sessions.find((row: any) => row.id === next);
    expect(cancelled).toMatchObject({ status: 'cancelled', topic: 'Math' });
    expect(new Date(cancelled.start_time).toISOString()).toBe('2030-10-30T13:00:00.000Z');
    expect(new Date(after.exclusions[0].start_time).toISOString()).toBe('2030-11-13T13:00:00.000Z');
  });

  it.each([7, -7])('moves a series %i days without transient student/start uniqueness conflicts', async days => {
    const shifted = new Date(Date.parse(oldStart) + days * 86_400_000);
    await expect(save({ start: shifted, end: new Date(shifted.getTime() + 3_600_000) })).resolves.toHaveLength(3);
  });

  it('clamps monthly occurrences from the new anchor instead of applying elapsed milliseconds', async () => {
    await db.exec(`DELETE FROM sessions WHERE id='${later}';
      UPDATE recurring_individual_sessions SET frequency='monthly', start_date='2031-01-31', day_of_week=5,
        start_time='13:00',end_time='14:00' WHERE id='${recurring}';
      UPDATE sessions SET start_time='2031-01-31T11:00Z',end_time='2031-01-31T12:00Z' WHERE id='${lesson}';
      UPDATE sessions SET start_time='2031-02-28T11:00Z',end_time='2031-02-28T12:00Z' WHERE id='${next}';`);
    const saved = await save({ oldStart: new Date('2031-01-31T11:00Z'), oldEnd: new Date('2031-01-31T12:00Z'),
      start: new Date('2031-01-30T11:00Z'), end: new Date('2031-01-30T12:00Z') });
    expect(saved.map(row => new Date(row.start_time).toISOString()).sort()).toEqual([
      '2031-01-30T11:00:00.000Z', '2031-02-28T11:00:00.000Z',
    ]);
  });

  it('keeps a monthly month-end anchor when only the clock or duration changes from a clamped occurrence', async () => {
    await db.exec(`UPDATE recurring_individual_sessions SET frequency='monthly', start_date='2031-01-31', day_of_week=5
      WHERE id='${recurring}';
      UPDATE sessions SET start_time='2031-01-31T11:00Z',end_time='2031-01-31T12:00Z' WHERE id='${lesson}';
      UPDATE sessions SET start_time='2031-02-28T11:00Z',end_time='2031-02-28T12:00Z' WHERE id='${next}';
      UPDATE sessions SET start_time='2031-03-31T10:00Z',end_time='2031-03-31T11:00Z' WHERE id='${later}';`);
    const saved = await save({ sessionId: next, oldStart: new Date('2031-02-28T11:00Z'), oldEnd: new Date('2031-02-28T12:00Z'),
      start: new Date('2031-02-28T13:00Z'), end: new Date('2031-02-28T14:30Z') });
    expect(saved.map(row => new Date(row.start_time).toISOString()).sort()).toEqual([
      '2031-01-31T13:00:00.000Z', '2031-02-28T13:00:00.000Z', '2031-03-31T12:00:00.000Z',
    ]);
    const r = await template();
    expect(r.start_date).toBe('2031-01-31');
    expect(buildRollingOccurrenceDates(r, '2031-04-01', '2031-05-31')).toEqual(['2031-04-30', '2031-05-31']);
  });

  it('leaves the entire series unchanged when a later destination conflicts with another lesson', async () => {
    await db.exec(`INSERT INTO sessions(id,tutor_id,student_id,start_time,end_time) VALUES
      ('${id(20)}','${tutor}','${id(21)}','2030-10-30T13:30Z','2030-10-30T14:30Z');`);
    const before = await snapshot();
    await expect(save()).rejects.toThrow('reschedule_conflict');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back already written occurrences if a later write fails', async () => {
    await db.exec(`RESET ROLE; CREATE OR REPLACE FUNCTION test_fail_write() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN IF NEW.id='${next}' THEN RAISE EXCEPTION 'test write failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_write BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION test_fail_write();
      SET ROLE service_role;`);
    const before = await snapshot();
    await expect(save()).rejects.toThrow('reschedule_error');
    expect(await snapshot()).toEqual(before);
  });

  it('rejects stale source times before writing anything', async () => {
    const before = await snapshot();
    await expect(save({ oldStart: new Date('2030-10-22T09:00Z') })).rejects.toThrow('reschedule_changed');
    expect(await snapshot()).toEqual(before);
  });

  it('derives tutor identity from the verified JWT and rejects unrelated recurrence IDs', async () => {
    const before = await snapshot();
    const result = await request({ ...input(), tutorId: otherTutor, recurringIds: [recurring, otherSeries] });
    expect(result).toMatchObject({ status: 409, body: { code: 'reschedule_unavailable' } });
    expect(rpcCalls[0].p_tutor).toBe(tutor);
    expect(await snapshot()).toEqual(before);
  });

  it('rejects another tutor’s lesson and disallowed billing/ownership fields', async () => {
    await db.exec(`UPDATE sessions SET tutor_id='${otherTutor}' WHERE id='${lesson}'`);
    const before = await snapshot();
    await expect(save()).rejects.toThrow('reschedule_unavailable');
    expect(await snapshot()).toEqual(before);
    await db.exec(`UPDATE sessions SET tutor_id='${tutor}' WHERE id='${lesson}'`);
    const own = await snapshot();
    await expect(save({ fields: { tutor_id: otherTutor, paid: true, lesson_package_id: null } })).rejects.toThrow('reschedule_invalid');
    expect(await snapshot()).toEqual(own);
  });

  it('edits all group participants while preserving each template end date', async () => {
    await db.exec(`INSERT INTO recurring_individual_sessions SELECT '${otherSeries}',tutor_id,'${peer}',subject_id,
      day_of_week,start_time,end_time,start_date,'2030-10-29',active,frequency,meeting_link,topic,price,
      last_materialized_at,updated_at,created_at FROM recurring_individual_sessions WHERE id='${recurring}';
      INSERT INTO sessions(id,tutor_id,student_id,subject_id,recurring_session_id,start_time,end_time) VALUES
        ('${id(22)}','${tutor}','${peer}','${subject}','${otherSeries}','${oldStart}','${oldEnd}'),
        ('${id(23)}','${tutor}','${peer}','${subject}','${otherSeries}','2030-10-29T11:00Z','2030-10-29T12:00Z');`);
    await expect(save({ recurringIds: [recurring, otherSeries] })).resolves.toHaveLength(5);
    expect((await template(otherSeries)).end_date).toBe('2030-10-30');
  });

  it.each(['tutor_recurring_reschedule_approval', 'org_admin_only_reschedule'])('respects the live %s flag', async flag => {
    await db.query('UPDATE organizations SET features=$1::jsonb', [JSON.stringify({ [flag]: true })]);
    const before = await snapshot();
    await expect(save()).rejects.toThrow('reschedule_approval_required');
    expect(await snapshot()).toEqual(before);
    await expect(save({ start: new Date(oldStart), end: new Date(oldEnd), reason: '' })).resolves.toHaveLength(3);
  });

  it('blocks edits for suspended organizations', async () => {
    await db.exec("UPDATE organizations SET status='suspended'");
    const before = await snapshot();
    await expect(save()).rejects.toThrow('reschedule_unavailable');
    expect(await snapshot()).toEqual(before);
  });

  it('rejects unauthenticated, internal and invalid requests without invoking the RPC', async () => {
    deniedToken = true;
    expect((await request(input())).status).toBe(401);
    deniedToken = false;
    expect((await request(input(), 'POST', { 'x-internal-key': 'service-key' } as any)).status).toBe(401);
    expect((await request(input(), 'GET')).status).toBe(405);
    expect((await request({ ...input(), recurringIds: [] })).status).toBe(400);
    expect((await request({ ...input(), newStart: 'invalid' })).status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });

  it('keeps the RPC and recurrence exclusions inaccessible to browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query(`SELECT edit_tutor_calendar_series($1::uuid,$2::uuid,$3::uuid[],
        $4::timestamptz,$5::timestamptz,$6::timestamptz,$7::timestamptz)`,
      [tutor,lesson,[recurring],oldStart,oldEnd,newStart,newEnd])).rejects.toThrow(/permission denied/);
      await expect(db.query('SELECT * FROM session_recurrence_exclusions')).rejects.toThrow(/permission denied/);
      await db.exec('RESET ROLE');
    }
  });
});
