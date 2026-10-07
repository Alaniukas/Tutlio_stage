// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const student = id(1);
const otherStudent = id(2);
const parent = id(3);
const otherParent = id(4);
const tutor = id(5);
const otherTutor = id(6);
const owner = id(7);
const financeAdmin = id(8);
const restrictedAdmin = id(9);
const org = id(10);
const otherOrg = id(11);
const migration = readFileSync('supabase/migrations/20261007071317_legacy_rpc_access_guards.sql','utf8');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('role',current_setting('test.role',true)) $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,email text,organization_id uuid);
    CREATE TABLE students(id uuid PRIMARY KEY,full_name text,email text,phone text,tutor_id uuid,linked_user_id uuid,
      age integer,grade text,payment_payer text,invite_code text);
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY,user_id uuid,full_name text,email text);
    CREATE TABLE parent_students(parent_id uuid,student_id uuid);
    CREATE TABLE organization_admins(user_id uuid,organization_id uuid,status text,role text,permissions jsonb);
    CREATE TABLE perlas_ledger(entity_type text,entity_id uuid,status text,volume numeric,net_amount numeric);
    INSERT INTO profiles VALUES('${tutor}','Tutor','tutor@example.test',null),('${otherTutor}','Other tutor','other@example.test',null);
    INSERT INTO students VALUES('${id(101)}','Child','child@example.test','123','${tutor}','${student}',12,'6','parent','PRIVATE-1'),
      ('${id(102)}','Other child','other@example.test','456','${otherTutor}','${otherStudent}',13,'7','parent','PRIVATE-2');
    INSERT INTO parent_profiles VALUES('${id(103)}','${parent}','Parent','parent@example.test'),('${id(104)}','${otherParent}','Other parent','other-parent@example.test');
    INSERT INTO parent_students VALUES('${id(103)}','${id(101)}'),('${id(104)}','${id(102)}');
    INSERT INTO organization_admins VALUES('${owner}','${org}','active','owner','{}'),
      ('${financeAdmin}','${org}','active','custom','{"finance.view":true}'),('${restrictedAdmin}','${org}','active','custom','{}');
    INSERT INTO perlas_ledger VALUES('tutor','${tutor}','pending',100,90),('tutor','${otherTutor}','pending',200,180),
      ('org','${org}','pending',300,270),('org','${org}','reserved',50,45),('org','${otherOrg}','pending',900,810);
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE organization_admins ENABLE ROW LEVEL SECURITY; ALTER TABLE perlas_ledger ENABLE ROW LEVEL SECURITY;
    CREATE POLICY students_own ON students FOR SELECT TO authenticated USING(linked_user_id=auth.uid());
    CREATE POLICY parent_own ON parent_profiles FOR SELECT TO authenticated USING(user_id=auth.uid());
    CREATE POLICY membership_own ON organization_admins FOR SELECT TO authenticated USING(user_id=auth.uid());
    CREATE POLICY tutor_ledger ON perlas_ledger FOR SELECT TO authenticated USING(entity_type='tutor' AND entity_id=auth.uid());
    CREATE POLICY org_ledger ON perlas_ledger FOR SELECT TO authenticated
      USING(entity_type='org' AND entity_id IN (SELECT organization_id FROM organization_admins WHERE user_id=auth.uid()));
    CREATE POLICY finance_gate ON perlas_ledger AS RESTRICTIVE FOR SELECT TO authenticated USING(
      NOT EXISTS(SELECT 1 FROM organization_admins WHERE user_id=auth.uid())
      OR EXISTS(SELECT 1 FROM organization_admins WHERE user_id=auth.uid() AND status='active'
        AND (role='owner' OR permissions @> '{"finance.view":true}'::jsonb OR permissions @> '{"finance.edit":true}'::jsonb)));
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
    -- Reproduce the production definer bypass without exposing real user data.
    CREATE FUNCTION public.get_student_by_user_id(p_user_id uuid)
      RETURNS TABLE(id uuid,full_name text,email text,phone text,tutor_id uuid,linked_user_id uuid)
      LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
      SELECT s.id,s.full_name,s.email,s.phone,s.tutor_id,s.linked_user_id FROM public.students s WHERE s.linked_user_id=p_user_id LIMIT 1;
    $$;
    CREATE FUNCTION public.get_perlas_balance_breakdown(p_entity_type text,p_entity_id uuid)
      RETURNS TABLE(pending_volume numeric,pending_net numeric,reserved_volume numeric,reserved_net numeric,total_paid_out_volume numeric,total_paid_out_net numeric)
      LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
      SELECT sum(volume),sum(net_amount),0::numeric,0::numeric,0::numeric,0::numeric
      FROM public.perlas_ledger WHERE entity_type=p_entity_type AND entity_id=p_entity_id;
    $$;
    CREATE SEQUENCE invoice_test_seq;
    CREATE FUNCTION public.next_b2c_invoice_number() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT nextval('public.invoice_test_seq'); $$;
    CREATE FUNCTION public.get_perlas_available_balance(text,uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$ SELECT 90::numeric $$;
    CREATE FUNCTION public.insert_payout_if_balance_sufficient(text,uuid,numeric,text,text,text,text,text)
      RETURNS TABLE(ok boolean,available numeric,payout_id uuid) LANGUAGE sql SECURITY DEFINER AS $$ SELECT true,90::numeric,null::uuid $$;
    CREATE FUNCTION public.admin_stats_locale_distribution() RETURNS TABLE(locale text,user_count bigint)
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'lt'::text,count(*) FROM public.profiles $$;
  `);
},30_000);

beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE'); });
afterAll(async () => { await db?.close(); });

async function asUser(user: string,role='authenticated') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid',$1,false),set_config('test.role',$2,false)",[user,role]);
  await db.exec(`SET ROLE ${role}`);
}
async function applyFix() { await db.exec('RESET ROLE'); await db.exec(migration); }
async function expectDenied(query: string) {
  await db.exec('SAVEPOINT denied_call');
  await expect(db.query(query)).rejects.toThrow(/permission denied/);
  await db.exec('ROLLBACK TO SAVEPOINT denied_call');
}

describe('legacy RPC caller access', () => {
  it('reproduces anonymous definer access and closes it after migration', async () => {
    await asUser('','anon');
    expect((await db.query('SELECT * FROM students')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM get_student_by_user_id($1)',[student])).rows).toHaveLength(1);
    expect((await db.query<{pending_net: string}>('SELECT * FROM get_perlas_balance_breakdown($1,$2)',['org',org])).rows[0].pending_net).toBe('315');
    await applyFix();
    await asUser('','anon');
    await expectDenied(`SELECT * FROM get_student_by_user_id('${student}')`);
    await expectDenied(`SELECT * FROM get_perlas_balance_breakdown('org','${org}')`);
  });

  it('returns only the caller student and that student’s registered parents', async () => {
    await applyFix();
    await asUser(student);
    expect((await db.query('SELECT id FROM get_student_by_user_id($1)',[student])).rows).toEqual([{id:id(101)}]);
    expect((await db.query('SELECT invite_code FROM get_student_full_info($1)',[student])).rows).toEqual([{invite_code:'PRIVATE-1'}]);
    expect((await db.query('SELECT * FROM get_student_full_info($1)',[otherStudent])).rows).toEqual([]);
    expect((await db.query('SELECT * FROM get_student_by_user_id($1)',[otherStudent])).rows).toEqual([]);
    expect((await db.query('SELECT * FROM get_registered_parents_for_linked_student($1,$2)',[id(101),student])).rows).toEqual([{full_name:'Parent',email:'parent@example.test'}]);
    expect((await db.query('SELECT * FROM get_registered_parents_for_linked_student($1,$2)',[id(102),otherStudent])).rows).toEqual([]);
    expect((await db.query('SELECT * FROM get_registered_parents_for_linked_student($1,$2)',[id(102),student])).rows).toEqual([]);
  });

  it('binds parent profile lookups to the caller and rejects null or foreign user IDs', async () => {
    await applyFix();
    await asUser(parent);
    expect((await db.query('SELECT * FROM get_parent_profile_by_user_id($1)',[parent])).rows).toEqual([{id:id(103),full_name:'Parent'}]);
    expect((await db.query('SELECT * FROM get_parent_profile_by_user_id($1)',[otherParent])).rows).toEqual([]);
    expect((await db.query<{value:string|null}>('SELECT get_parent_profile_id_by_user_id($1) value',[otherParent])).rows[0].value).toBeNull();
    expect((await db.query<{value:string|null}>('SELECT get_parent_profile_id_by_user_id($1) value',[parent])).rows[0].value).toBe(id(103));
    await asUser('');
    expect((await db.query('SELECT * FROM get_parent_profile_by_user_id($1)',[parent])).rows).toEqual([]);
  });

  it('uses ledger RLS for tutor, organization and finance-permission boundaries', async () => {
    await applyFix();
    const balance = async (type: string,entity: string) => Number((await db.query<{pending_net:string}>('SELECT * FROM get_perlas_balance_breakdown($1,$2)',[type,entity])).rows[0].pending_net);
    await asUser(tutor);
    expect(await balance('tutor',tutor)).toBe(90);
    expect(await balance('tutor',otherTutor)).toBe(0);
    expect(await balance('org',org)).toBe(0);
    for (const user of [owner,financeAdmin]) {
      await asUser(user);
      expect(await balance('org',org)).toBe(270);
      expect(await balance('org',otherOrg)).toBe(0);
    }
    await asUser(restrictedAdmin);
    expect(await balance('org',org)).toBe(0);
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE organization_admins SET status='revoked' WHERE user_id='${financeAdmin}'`);
    await asUser(financeAdmin);
    expect(await balance('org',org)).toBe(0);
  });

  it('keeps identity lookups, payout helpers, admin stats and invoice allocation working for service callers', async () => {
    await applyFix();
    await asUser('','service_role');
    expect((await db.query('SELECT * FROM get_student_full_info($1)',[otherStudent])).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM get_parent_profile_by_user_id($1)',[otherParent])).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM get_registered_parents_for_linked_student($1,$2)',[id(102),otherStudent])).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM get_perlas_balance_breakdown($1,$2)',['org',otherOrg])).rows[0].pending_net).toBe('810');
    expect((await db.query('SELECT * FROM admin_stats_locale_distribution()')).rows).toHaveLength(1);
    expect((await db.query(`SELECT * FROM insert_payout_if_balance_sufficient('tutor','${tutor}',1,'EUR','','','','')`)).rows[0].ok).toBe(true);
    expect(Number((await db.query('SELECT next_b2c_invoice_number() value')).rows[0].value)).toBeGreaterThan(0);
  });

  it('removes PUBLIC inheritance from sensitive server RPCs and remains idempotent when old helpers are absent', async () => {
    await applyFix();
    for (const signature of ['next_b2c_invoice_number()','admin_stats_locale_distribution()',
      'get_perlas_available_balance(text,uuid)','insert_payout_if_balance_sufficient(text,uuid,numeric,text,text,text,text,text)']) {
      for (const role of ['anon','authenticated']) {
        expect((await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,'public.'+signature])).rows[0].allowed).toBe(false);
      }
    }
    const sequenceBefore = (await db.query('SELECT last_value,is_called FROM invoice_test_seq')).rows;
    await asUser(student);
    await expectDenied('SELECT next_b2c_invoice_number()');
    await expectDenied(`SELECT * FROM insert_payout_if_balance_sufficient('tutor','${tutor}',1,'EUR','','','','')`);
    await db.exec('RESET ROLE');
    expect((await db.query('SELECT last_value,is_called FROM invoice_test_seq')).rows).toEqual(sequenceBefore);
    await db.exec('DROP FUNCTION public.insert_payout_if_balance_sufficient(text,uuid,numeric,text,text,text,text,text)');
    await applyFix();
    await asUser(student);
    expect((await db.query('SELECT * FROM get_student_by_user_id($1)',[student])).rows).toHaveLength(1);
  });
});
