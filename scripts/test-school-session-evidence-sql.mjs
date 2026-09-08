import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const teacher = '00000000-0000-4000-8000-000000000001';
const student = '00000000-0000-4000-8000-000000000002';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
CREATE TABLE sessions(id int PRIMARY KEY, tutor_id uuid, start_time timestamptz, end_time timestamptz, status text, tutor_joined_at timestamptz, status_confirmed_at timestamptz, status_confirmed_by uuid, notes text);
GRANT SELECT,INSERT,UPDATE ON sessions TO authenticated, anon, service_role;`);
await db.exec(readFileSync('supabase/migrations/20260908094256_school_session_billing_evidence_guard.sql', 'utf8'));
await db.query(`INSERT INTO sessions(id,tutor_id,start_time,end_time,status) VALUES
 (1,$1,now()-interval '10 minutes',now()+interval '40 minutes','active'),
 (2,$1,now()-interval '2 days',now()-interval '1 day','completed'),
 (3,$1,now()+interval '2 days',now()+interval '3 days','active')`, [teacher]);
await db.exec('SET ROLE authenticated');
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [student]);
await assert.rejects(db.exec('UPDATE sessions SET tutor_joined_at=now() WHERE id=1'), /assigned teacher/);
await assert.rejects(db.exec('UPDATE sessions SET status_confirmed_at=now() WHERE id=2'), /confirmation API/);
await assert.rejects(db.exec("INSERT INTO sessions(id,status_confirmed_at) VALUES(4,now())"), /authorized action/);
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [teacher]);
await assert.rejects(db.exec('UPDATE sessions SET tutor_joined_at=now() WHERE id=2'), /join window/);
await assert.rejects(db.exec('UPDATE sessions SET tutor_joined_at=now() WHERE id=3'), /join window/);
await assert.rejects(db.exec("UPDATE sessions SET tutor_joined_at=now(),start_time=now() WHERE id=1"), /join window/);
await db.exec("UPDATE sessions SET tutor_joined_at='2000-01-01' WHERE id=1");
assert.equal((await db.query("SELECT tutor_joined_at > now()-interval '1 minute' AS current FROM sessions WHERE id=1")).rows[0].current, true);
await assert.rejects(db.exec('UPDATE sessions SET tutor_joined_at=now() WHERE id=1'), /join window/);
await assert.rejects(db.exec('UPDATE sessions SET tutor_joined_at=NULL WHERE id=1'), /join window/);
await db.exec("UPDATE sessions SET notes='Legitimate metadata edit' WHERE id=1");
await db.exec('RESET ROLE; SET ROLE service_role');
await db.query('UPDATE sessions SET status_confirmed_at=now(),status_confirmed_by=$1,tutor_joined_at=start_time WHERE id=2', [teacher]);
assert.ok((await db.query('SELECT status_confirmed_at FROM sessions WHERE id=2')).rows[0].status_confirmed_at);
await db.exec('RESET ROLE; SET ROLE authenticated');
await db.exec("UPDATE sessions SET status='active',status_confirmed_at=NULL,status_confirmed_by=NULL WHERE id=2");
assert.equal((await db.query('SELECT status_confirmed_at FROM sessions WHERE id=2')).rows[0].status_confirmed_at, null);
await db.close();
console.log('PASS: forged confirmation denied, teacher ownership/window enforced, browser timestamp normalized, repeat stamp denied, service API allowed, metadata edits and evidence clearing retained.');
