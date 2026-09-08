import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE students(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE subjects(id uuid PRIMARY KEY, tutor_id uuid);`);
const original = readFileSync('supabase/migrations/20260826140000_school_extra_lessons.sql', 'utf8');
await db.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.school_class_groups'), original.indexOf('ALTER TABLE public.school_contracts\r\n  DROP CONSTRAINT') < 0 ? original.indexOf('ALTER TABLE public.school_contracts\n  DROP CONSTRAINT') : original.indexOf('ALTER TABLE public.school_contracts\r\n  DROP CONSTRAINT')));
await db.exec('ALTER TABLE school_class_groups ADD COLUMN calendar_name text;');
for (const name of ['20260908080341_school_member_schedule.sql', '20260908084926_atomic_school_group_save.sql']) {
  await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
}
await db.query('INSERT INTO organizations VALUES ($1),($2)', [id(1), id(2)]);
await db.query('INSERT INTO auth.users VALUES ($1)', [id(3)]);
await db.query('INSERT INTO profiles VALUES ($1,$2)', [id(3), id(1)]);
await db.query('INSERT INTO students VALUES ($1,$2),($3,$4)', [id(4), id(1), id(5), id(2)]);
const fields = { tutor_id: id(3), name: 'Original', school_year_start: '2026-09-01', school_year_end: '2027-06-01', platform: 'Meet', duration_minutes: 60 };
const slots = [1,3,5].map(weekday => ({ weekday, start_time: '16:00', end_time: '17:00' }));
const members = [{ student_id: id(4), schedule_slots: slots.slice(0,2) }];
const save = (groupId, f, s, m, orgId = id(1)) => db.query('SELECT save_school_class_group($1,$2,$3,$4,$5,$6) AS saved', [groupId, orgId, id(3), f, s, m]);
const group = (await save(null, fields, slots, members)).rows[0].saved;
assert.equal((await db.query('SELECT count(*)::int AS n FROM school_class_group_slots')).rows[0].n, 3);
const before = (await db.query('SELECT enrolled_at FROM school_class_group_members')).rows[0].enrolled_at;
await save(group.id, { ...fields, name: 'Updated' }, slots, members);
assert.deepEqual((await db.query('SELECT enrolled_at FROM school_class_group_members')).rows[0].enrolled_at, before);
await assert.rejects(save(group.id, { ...fields, name: 'Must roll back' }, [slots[0], { ...slots[1], weekday: 8 }], members), /check constraint/);
assert.equal((await db.query('SELECT name FROM school_class_groups')).rows[0].name, 'Updated');
assert.equal((await db.query('SELECT count(*)::int AS n FROM school_class_group_slots')).rows[0].n, 3);
await assert.rejects(save(group.id, fields, [slots[2]], null), /subset/);
await assert.rejects(save(group.id, fields, slots, [{ student_id: id(5), schedule_slots: null }]), /organization/);
await db.query('INSERT INTO subjects VALUES ($1,$2)', [id(6), id(7)]);
await assert.rejects(save(group.id, { ...fields, subject_id: id(6) }, slots, members), /Subject does not belong/);
await assert.rejects(save(null, fields, [slots[0], { ...slots[1], weekday: 9 }], null), /check constraint/);
assert.equal((await db.query('SELECT count(*)::int AS n FROM school_class_groups')).rows[0].n, 1);
for (const role of ['anon', 'authenticated']) {
  await db.exec('SET ROLE ' + role);
  await assert.rejects(save(group.id, fields, slots, members), /permission denied/);
  await db.exec('RESET ROLE');
}
console.log('PASS: atomic group create/update, failed-write rollback, preserved enrollment, subset validation, organization isolation and private RPC.');
await db.close();
