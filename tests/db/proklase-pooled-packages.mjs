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
      email text, full_name text, detached_at timestamptz, payer_email text);
    CREATE TABLE subjects(id uuid PRIMARY KEY, tutor_id uuid, name text, is_trial boolean DEFAULT false);
    CREATE TABLE lesson_packages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id uuid, student_id uuid,
      subject_id uuid, total_lessons int NOT NULL, available_lessons int NOT NULL CHECK(available_lessons>=0),
      reserved_lessons int NOT NULL DEFAULT 0, completed_lessons int NOT NULL DEFAULT 0, price_per_lesson numeric,
      total_price numeric, paid boolean NOT NULL DEFAULT false, payment_status text, active boolean,
      payment_method text, billing_period_start date, billing_period_end date, expires_at timestamptz,
      stripe_checkout_session_id text, cancelled_at timestamptz, cancelled_by uuid,
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
      is_complimentary boolean DEFAULT false, is_makeup boolean DEFAULT false, is_late_cancelled boolean DEFAULT false,
      reservation_expires_at timestamptz);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20260908170000_org_student_pooled_packages.sql', import.meta.url), 'utf8'));
  await db.query(`INSERT INTO organizations(id) VALUES($1)`, [id(999)]);
  await db.query(`INSERT INTO lesson_packages(
      id,tutor_id,student_id,total_lessons,available_lessons,reserved_lessons,completed_lessons,
      price_per_lesson,total_price,paid,payment_status,active,billing_period_start,billing_period_end,
      pool_organization_id,pool_identity_key,pool_student_ids,pool_preview_token,pool_session_ids
    ) VALUES($1,$2,$3,1,1,0,0,27,27,false,'pending',true,'2099-08-01','2099-08-31',$4,'legacy',$5,$6,$7)`,
    [id(998),id(997),id(996),id(999),[id(996)],'legacy-preview',[id(995)]]);
  await db.exec(await readFile(new URL('../../supabase/migrations/20260910174000_org_student_pooled_packages.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20260916170000_atomic_package_cancellation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20260929092902_proklase_pooled_package_item_prices.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20260929180153_pooled_package_identity_drift.sql', import.meta.url), 'utf8'));
  assert.deepEqual((await db.query(`SELECT preview_token,session_ids FROM pooled_package_quotes WHERE package_id=$1`, [id(998)])).rows[0],
    {preview_token:'legacy-preview',session_ids:[id(995)]}, 'legacy checkout state must move to the private quote table');
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM pg_policies
    WHERE schemaname='public' AND tablename='lesson_packages'
      AND policyname='pooled_package_direct_read_guard' AND permissive='RESTRICTIVE'`)).rows[0].count, 1,
    'a restrictive policy must block authenticated direct reads of legacy pooled rows');
  await db.query('INSERT INTO organizations VALUES ($1),($2)', [proOrgId, id(2)]);
  await db.query('INSERT INTO profiles VALUES ($1,$3),($2,$3),($4,$5)', [id(10), id(11), proOrgId, id(12), id(2)]);
  for (const [student, tutor, org, user, name] of [[20,10,proOrgId,50,'Same Child'],[21,11,proOrgId,50,'Same Child'],[22,10,proOrgId,51,'Different Child'],[23,12,id(2),50,'Same Child']]) {
    await db.query('INSERT INTO students(id,tutor_id,organization_id,linked_user_id,email,full_name,detached_at) VALUES ($1,$2,$3,$4,$5,$6,null)',
      [id(student),id(tutor),org,id(user),'parent@example.test',name]);
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
  assert.deepEqual((await db.query('SELECT price_per_lesson::text AS price FROM lesson_package_items WHERE package_id=$1 ORDER BY position',[pkg])).rows,
    [{price:'27'},{price:'27'}], 'older callers still use the common fallback price');
  // A custom EUR25 rate on one subject must change both the item and the
  // checkout total; the second subject still uses the EUR31 common fallback.
  await db.query("INSERT INTO sessions(id,student_id,tutor_id,subject_id,start_time) VALUES($1,$2,$3,$4,'2099-10-02T12:00:00Z'),($5,$6,$7,$8,'2099-10-03T12:00:00Z')",
    [id(201),id(20),id(10),id(30),id(202),id(21),id(11),id(31)]);
  const mixedItems = [{subjectId:id(30),totalLessons:1,pricePerLesson:25},{subjectId:id(31),totalLessons:1}];
  const mixedParams = [id(20),proOrgId,[id(20),id(21)],JSON.stringify(mixedItems),31,'2099-10-01','2099-10-31','mixed-preview',[id(201),id(202)]];
  await assert.rejects(db.query(createSql, mixedParams.map((value,index) => index === 3
    ? JSON.stringify([{...mixedItems[0],pricePerLesson:25.001},mixedItems[1]]) : value)),
  /Invalid package item price/, 'rates with fractions of a cent must be rejected');
  await assert.rejects(db.query(createSql, mixedParams.map((value,index) => index === 3
    ? JSON.stringify([{...mixedItems[0],pricePerLesson:'25'},mixedItems[1]]) : value)),
  /Invalid package item price/, 'item rates must be JSON numbers');
  const mixedPkg = (await db.query(createSql,mixedParams)).rows[0].id;
  assert.deepEqual((await db.query('SELECT total_lessons,price_per_lesson,total_price::text FROM lesson_packages WHERE id=$1',[mixedPkg])).rows[0],
    {total_lessons:2,price_per_lesson:null,total_price:'56'});
  assert.deepEqual((await db.query('SELECT price_per_lesson::text AS price,total_price::text AS total FROM lesson_package_items WHERE package_id=$1 ORDER BY position',[mixedPkg])).rows,
    [{price:'25',total:'25'},{price:'31',total:'31'}]);
  // A wrong EUR31 November offer blocks a second send until it is annulled.
  // The old quote stays as an audit record, while the same identity and month
  // become available for a fresh EUR25 offer and payment link.
  await db.query("INSERT INTO sessions(id,student_id,tutor_id,subject_id,start_time) VALUES($1,$2,$3,$4,'2099-11-03T12:00:00Z')",
    [id(203),id(21),id(11),id(31)]);
  const oldOfferParams = [id(20),proOrgId,[id(20),id(21)],JSON.stringify([{subjectId:id(31),totalLessons:1}]),
    31,'2099-11-01','2099-11-30','wrong-price-preview',[id(203)]];
  const oldOfferId = (await db.query(createSql,oldOfferParams)).rows[0].id;
  await db.query('UPDATE lesson_packages SET stripe_checkout_session_id=$1 WHERE id=$2', ['cs_old_checkout',oldOfferId]);
  const correctedOfferParams = oldOfferParams.map((value,index) =>
    index === 3 ? JSON.stringify([{subjectId:id(31),totalLessons:1,pricePerLesson:25}])
      : index === 7 ? 'corrected-price-preview' : value);
  await assert.rejects(db.query(createSql,correctedOfferParams),
    /A package already exists for this student and period/, 'a live wrong-price offer must block a duplicate');
  const cancelSql = 'SELECT cancel_pending_lesson_package($1,$2,$3) AS id';
  assert.equal((await db.query(cancelSql,[oldOfferId,proOrgId,id(52)])).rows[0].id,oldOfferId);
  const oldOffer = (await db.query(`SELECT paid,payment_status,active,total_price::text AS total_price,
    stripe_checkout_session_id,cancelled_at IS NOT NULL AS was_cancelled,cancelled_by
    FROM lesson_packages WHERE id=$1`,[oldOfferId])).rows[0];
  assert.deepEqual(oldOffer,{
    paid:false,payment_status:'cancelled',active:false,total_price:'31',
    stripe_checkout_session_id:null,was_cancelled:true,cancelled_by:id(52),
  });
  const visibleOffers = async () => (await db.query(`SELECT id FROM lesson_packages
    WHERE pool_organization_id=$1 AND pool_identity_key=package_student_identity((SELECT s FROM students s WHERE id=$2))
      AND billing_period_end='2099-11-30' AND (active IS DISTINCT FROM false OR payment_status='pending')
      AND payment_status<>'cancelled' ORDER BY created_at`,[proOrgId,id(21)])).rows.map(row => row.id);
  assert.deepEqual(await visibleOffers(),[], 'annulled package must disappear from the admin offer list');
  const correctedOfferId = (await db.query(createSql,correctedOfferParams)).rows[0].id;
  assert.notEqual(correctedOfferId,oldOfferId, 'resending after annulment must create a new package');
  assert.deepEqual(await visibleOffers(),[correctedOfferId]);
  assert.deepEqual((await db.query('SELECT payment_status,total_price::text AS total_price FROM lesson_packages WHERE id=$1',[correctedOfferId])).rows[0],
    {payment_status:'pending',total_price:'25'});
  assert.deepEqual((await db.query('SELECT price_per_lesson::text AS price,total_price::text AS total FROM lesson_package_items WHERE package_id=$1',[correctedOfferId])).rows,
    [{price:'25',total:'25'}]);
  assert.equal((await db.query('SELECT preview_token FROM pooled_package_quotes WHERE package_id=$1',[oldOfferId])).rows[0].preview_token,
    'wrong-price-preview', 'cancelled quote remains available for audit without blocking the new package');
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
  assert.equal((await db.query('SELECT price::text FROM sessions WHERE id=$1',[id(100)])).rows[0].price,'27','payment must apply the frozen quoted item price');
  await db.query("UPDATE sessions SET status='no_show' WHERE id=$1", [id(200)]);
  assert.deepEqual(await counters(), {available_lessons:0,reserved_lessons:7,completed_lessons:2});
  await db.query("UPDATE sessions SET status='cancelled',is_late_cancelled=true WHERE id=$1", [id(200)]);
  assert.deepEqual(await counters(), {available_lessons:0,reserved_lessons:7,completed_lessons:2});
  await db.query("UPDATE sessions SET is_late_cancelled=false WHERE id=$1", [id(200)]);
  assert.deepEqual(await counters(), {available_lessons:1,reserved_lessons:7,completed_lessons:1});
  await assert.rejects(db.query("INSERT INTO sessions(student_id,tutor_id,subject_id,start_time,lesson_package_id) VALUES($1,$2,$3,'2099-09-30T21:00Z',$4)",
    [id(21),id(11),id(31),pkg]), /unavailable/, 'October in Vilnius must not consume September credits');
  assert.deepEqual(await counters(), {available_lessons:1,reserved_lessons:7,completed_lessons:1});
  console.log('PASS: migrations execute; mixed and legacy prices; annulled offers disappear and can be recreated at corrected prices; payment allocation; cross-tutor reuse and identity guards.');
} catch (error) {
  console.error(error.message, error.internalQuery || '', error.where || '');
  process.exitCode = 1;
} finally { await db.close(); }
