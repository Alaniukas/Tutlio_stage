// Standalone PostgreSQL regression: PGLITE_MODULE points to an installed PGlite entry.
// Uses only an in-memory database; never reads application environment credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const proOrgId = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE organization_admins(organization_id uuid, user_id uuid);
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE students(id uuid PRIMARY KEY, tutor_id uuid, organization_id uuid, linked_user_id uuid,
      email text, full_name text, detached_at timestamptz);
    CREATE TABLE subjects(id uuid PRIMARY KEY, tutor_id uuid, name text, is_trial boolean DEFAULT false);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id uuid, student_id uuid,
      subject_id uuid, total_lessons int NOT NULL, available_lessons int NOT NULL CHECK(available_lessons>=0),
      reserved_lessons int NOT NULL DEFAULT 0, completed_lessons int NOT NULL DEFAULT 0, price_per_lesson numeric,
      total_price numeric, paid boolean NOT NULL DEFAULT false, payment_status text, active boolean,
      payment_method text, billing_period_start date, billing_period_end date, expires_at timestamptz,
      updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
    CREATE TABLE lesson_package_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      package_id uuid REFERENCES lesson_packages(id) ON DELETE CASCADE, subject_id uuid,
      total_lessons int CHECK(total_lessons>0), available_lessons int CHECK(available_lessons>=0),
      reserved_lessons int DEFAULT 0, completed_lessons int DEFAULT 0, price_per_lesson numeric,
      total_price numeric, position int, created_at timestamptz DEFAULT now(),
      UNIQUE(package_id,subject_id), CHECK(available_lessons+reserved_lessons+completed_lessons<=total_lessons));
    CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, tutor_id uuid,
      subject_id uuid, start_time timestamptz, status text DEFAULT 'active', paid boolean DEFAULT false,
      payment_status text, price numeric DEFAULT 29, lesson_package_id uuid REFERENCES lesson_packages(id),
      is_complimentary boolean DEFAULT false, is_makeup boolean DEFAULT false, is_late_cancelled boolean DEFAULT false);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20260910174000_org_student_pooled_packages.sql', import.meta.url), 'utf8'));
  await db.query('INSERT INTO organizations VALUES ($1),($2)', [proOrgId, id(2)]);
  await db.query('INSERT INTO profiles VALUES ($1,$3),($2,$3),($4,$5)', [id(10), id(11), proOrgId, id(12), id(2)]);
  for (const [student, tutor, org, user, name] of [[20,10,proOrgId,50,'Same Child'],[21,11,proOrgId,50,'Same Child'],[22,10,proOrgId,51,'Different Child'],[23,12,id(2),50,'Same Child']]) {
    await db.query('INSERT INTO students VALUES ($1,$2,$3,$4,$5,$6,null)', [id(student),id(tutor),org,id(user),'parent@example.test',name]);
  }
  await db.query('INSERT INTO subjects(id,tutor_id,name) VALUES ($1,$2,$3),($4,$5,$6),($7,$5,$8)',
    [id(30),id(10),'Lithuanian',id(31),id(11),'Maths',id(32),'Physics']);
  const sessionIds = [];
  for (let n=0;n<9;n++) {
    sessionIds.push(id(100+n));
    await db.query('INSERT INTO sessions(id,student_id,tutor_id,subject_id,start_time) VALUES($1,$2,$3,$4,$5)',
      [id(100+n),id(n<4?20:21),id(n<4?10:11),id(n<4?30:31),`2099-09-${String(n+1).padStart(2,'0')}T12:00:00Z`]);
  }
  const items = [{subjectId:id(30),totalLessons:4},{subjectId:id(31),totalLessons:5}];
  const params = [id(20),proOrgId,[id(20),id(21)],JSON.stringify(items),27,'2099-09-01','2099-09-30','preview',sessionIds];
  const createSql = 'SELECT create_org_student_package($1,$2,$3,$4,$5,$6,$7,$8,$9) AS id';
  await db.query("INSERT INTO sessions(id,student_id,tutor_id,subject_id,start_time) VALUES($1,$2,$3,$4,'2099-09-15T12:00:00Z')",
    [id(199),id(21),id(11),id(31)]);
  await assert.rejects(db.query(createSql,params), /Schedule changed/, 'a newly added lesson must invalidate a stale quote');
  await db.query('DELETE FROM sessions WHERE id=$1', [id(199)]);
  const pkg = (await db.query(createSql,params)).rows[0].id;
  assert.equal((await db.query(createSql,params)).rows[0].id,pkg,'same send is idempotent');
  assert.deepEqual((await db.query('SELECT total_lessons,total_price::text FROM lesson_packages WHERE id=$1',[pkg])).rows[0],
    {total_lessons:9,total_price:'243'});
  await assert.rejects(db.query('UPDATE sessions SET lesson_package_id=$1 WHERE id=$2',[pkg,id(100)]), /unavailable/);
  await db.query("UPDATE lesson_packages SET paid=true,payment_status='paid' WHERE id=$1",[pkg]);
  const counters = async () => (await db.query('SELECT available_lessons,reserved_lessons,completed_lessons FROM lesson_packages WHERE id=$1',[pkg])).rows[0];
  assert.deepEqual(await counters(),{available_lessons:0,reserved_lessons:9,completed_lessons:0});
  await db.query("UPDATE sessions SET status='completed' WHERE id=$1",[id(100)]);
  assert.deepEqual(await counters(),{available_lessons:0,reserved_lessons:8,completed_lessons:1});
  await db.query("UPDATE sessions SET status='cancelled' WHERE id=$1",[id(101)]);
  assert.deepEqual(await counters(),{available_lessons:1,reserved_lessons:7,completed_lessons:1});
  // The invoker RPC observes real RLS at the second tutor and rejects another child.
  await db.exec(`ALTER TABLE students ENABLE ROW LEVEL SECURITY; ALTER TABLE lesson_packages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_student ON students FOR SELECT USING(tutor_id=auth.uid() OR linked_user_id=auth.uid());
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT ON students,lesson_packages TO authenticated;`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id(11)]);
  await db.exec('SET ROLE authenticated');
  const visiblePackage = (await db.query('SELECT * FROM get_pooled_packages_for_student($1)',[id(21)])).rows[0];
  assert.equal(visiblePackage.id,pkg);
  assert.equal(Object.hasOwn(visiblePackage, 'pool_identity_key'), false, 'identity key must not be exposed by the RPC');
  assert.equal(Object.hasOwn(visiblePackage, 'pool_student_ids'), false, 'sibling row ids must not be exposed by the RPC');
  await assert.rejects(db.query('SELECT * FROM pooled_package_quotes'), /permission denied/, 'quote state must remain server-only');
  assert.equal((await db.query('SELECT id FROM get_pooled_packages_for_student($1)',[id(22)])).rows.length,0);
  await db.exec('RESET ROLE');
  await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)");
  // A Lithuanian credit may be reused for a different subject at the second tutor.
  await db.query("INSERT INTO sessions(id,student_id,tutor_id,subject_id,start_time,lesson_package_id) VALUES($1,$2,$3,$4,'2099-09-20T12:00Z',$5)",
    [id(200),id(21),id(11),id(32),pkg]);
  assert.deepEqual(await counters(),{available_lessons:0,reserved_lessons:8,completed_lessons:1});
  await assert.rejects(db.query("INSERT INTO sessions(student_id,tutor_id,subject_id,start_time,lesson_package_id) VALUES($1,$2,$3,'2099-09-21T12:00Z',$4)",
    [id(21),id(11),id(31),pkg]),/No pooled credits/);
  await assert.rejects(db.query('UPDATE sessions SET student_id=$1 WHERE id=$2',[id(22),id(100)]),/outside package/);
  await assert.rejects(db.query('UPDATE sessions SET tutor_id=$1 WHERE id=$2',[id(12),id(100)]),/outside package/);
  await assert.rejects(db.query('UPDATE lesson_packages SET total_price=1 WHERE id=$1',[pkg]),/immutable/);
  const breakdown=(await db.query('SELECT total_lessons,available_lessons FROM lesson_package_items WHERE package_id=$1 ORDER BY position',[pkg])).rows;
  assert.deepEqual(breakdown,[{total_lessons:4,available_lessons:4},{total_lessons:5,available_lessons:5}]);
  assert.equal((await db.query('SELECT price::text FROM sessions WHERE id=$1',[id(100)])).rows[0].price,'29','payment must not rewrite lesson/tutor remuneration');
  await db.query("UPDATE sessions SET status='no_show' WHERE id=$1", [id(200)]);
  assert.deepEqual(await counters(), {available_lessons:0,reserved_lessons:7,completed_lessons:2});
  await db.query("UPDATE sessions SET status='cancelled',is_late_cancelled=true WHERE id=$1", [id(200)]);
  assert.deepEqual(await counters(), {available_lessons:0,reserved_lessons:7,completed_lessons:2});
  await db.query("UPDATE sessions SET is_late_cancelled=false WHERE id=$1", [id(200)]);
  assert.deepEqual(await counters(), {available_lessons:1,reserved_lessons:7,completed_lessons:1});
  await assert.rejects(db.query("INSERT INTO sessions(student_id,tutor_id,subject_id,start_time,lesson_package_id) VALUES($1,$2,$3,'2099-09-30T21:00Z',$4)",
    [id(21),id(11),id(31),pkg]), /unavailable/, 'October in Vilnius must not consume September credits');
  assert.deepEqual(await counters(), {available_lessons:1,reserved_lessons:7,completed_lessons:1});
  console.log('PASS: migration executes; 4+5=9 credits at EUR27; idempotent creation; payment allocation; completion/cancellation; cross-tutor cross-subject reuse; overbooking and identity guards.');
} catch (error) {
  console.error(error.message, error.internalQuery || '', error.where || '');
  process.exitCode = 1;
} finally { await db.close(); }
