// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),client:vi.fn()}));
vi.mock('../../api/_lib/auth.js',()=>({verifyRequestAuth:mocks.auth}));
vi.mock('../../api/_lib/orgAdminAccess.js',()=>({getOrgAdminAccessByUserId:mocks.access}));
vi.mock('../../api/_lib/supportPersistence.js',()=>({getSupportServiceClient:mocks.client}));
import ingestHandler from '../../api/org-admin-telemetry';
import reportHandler from '../../api/admin-usage';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fingerprint = 'a'.repeat(64);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE organizations(id uuid PRIMARY KEY,name text,entity_type text DEFAULT 'company',status text DEFAULT 'active',created_at timestamptz DEFAULT now(),features jsonb DEFAULT '{}');
    CREATE TABLE organization_admins(organization_id uuid,user_id uuid,role text DEFAULT 'owner',status text DEFAULT 'active',permissions jsonb DEFAULT '{}');
    CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,email text);
    CREATE TABLE support_vercel_log_events(project_id text,vercel_id text,path text,status_code integer,level text,occurred_at timestamptz,message text);
    GRANT SELECT ON organizations,organization_admins,profiles TO service_role;
    GRANT SELECT,DELETE ON support_vercel_log_events TO service_role;`);
  await db.exec(readFileSync('supabase/migrations/20261013170213_org_admin_usage_telemetry.sql', 'utf8'));
}, 30_000);
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE org_admin_usage_state,organizations,organization_admins,profiles,auth.users,support_vercel_log_events CASCADE;
    INSERT INTO organizations(id,name) VALUES ('${id(1)}','Agency A'),('${id(2)}','Agency B');
    INSERT INTO auth.users VALUES ('${id(11)}'),('${id(12)}');
    INSERT INTO organization_admins(organization_id,user_id) VALUES ('${id(1)}','${id(11)}'),('${id(2)}','${id(12)}');
    INSERT INTO profiles VALUES ('${id(11)}','Admin A','a@example.com'),('${id(12)}','Admin B','b@example.com');`);
});
async function record(options: { sequence?: number; client?: number; org?: number; user?: number; active?: boolean; modules?: Record<string,number>; actions?: Record<string, number>; errors?: unknown[] } = {}) {
  return (await db.query<{ result: { accepted: boolean; duplicate?: boolean; retry_after?: number } }>(
    'SELECT record_org_admin_telemetry($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12) result',
    [id(options.org || 1),id(options.user || 11),id(options.client || 21),options.sequence || 1,options.active === false ? null : new Date().toISOString(),
      'students','student.create',JSON.stringify(options.modules || (options.active === false ? {} : { students: 1 })),JSON.stringify(options.actions || { 'student.create.success': 1 }),JSON.stringify(options.errors || []),'release-1',null],
  )).rows[0].result;
}
const error = () => ({ fingerprint,kind:'api',module:'students',code:'http_500',endpoint:'/api/invite-tutor',status:500,count:1,frames:[],breadcrumbs:[] });
const report = async (org: number | null = null) => (await db.query<{ result: any }>('SELECT org_admin_usage_report($1,25,0,\'\',false,\'project\') result', [org ? id(org) : null])).rows[0].result;

describe('private admin telemetry storage', () => {
  it('walks the HTTP ingestion → actual PostgreSQL RPC → protected report flow, including retry replay',async()=>{
    vi.stubEnv('ADMIN_SECRET','fixture-secret');mocks.auth.mockResolvedValue({userId:id(11),isInternal:false});mocks.access.mockResolvedValue({organizationId:id(1),userId:id(11),status:'active'});
    mocks.client.mockReturnValue({rpc:async(name:string,args:any)=>{
      try {
        const result=name==='record_org_admin_telemetry'
          ? await db.query<any>('SELECT record_org_admin_telemetry($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12) result',[args.p_organization_id,args.p_user_id,args.p_client_id,args.p_sequence,args.p_active_at,args.p_last_module,args.p_last_action,JSON.stringify(args.p_modules),JSON.stringify(args.p_actions),JSON.stringify(args.p_errors),args.p_release,args.p_login_at])
          : await db.query<any>('SELECT org_admin_usage_report($1,$2,$3,$4,$5,$6) result',[args.p_organization_id,args.p_limit,args.p_offset,args.p_search,args.p_include_demo,args.p_project_id]);
        return {data:result.rows[0].result,error:null};
      } catch(error) {return {data:null,error};}
    }});
    const response=()=>{const value={status:200,body:null as any};const res:any={setHeader:()=>{},status:(status:number)=>{value.status=status;return res;},json:(body:any)=>{value.body=body;return res;}};return {res,value};};
    const body={clientId:id(21),sequence:1,activeAt:new Date().toISOString(),lastModule:'students',lastAction:'student.create',modules:{students:1},actions:{'student.create.success':1},errors:[],release:'test-flow'};
    for(let repeat=0;repeat<2;repeat++){const result=response();await ingestHandler({method:'POST',headers:{},body} as any,result.res);expect(result.value.status).toBe(200);}
    const result=response();await reportHandler({method:'GET',headers:{'x-admin-secret':'fixture-secret'},query:{organization:id(1)}} as any,result.res);
    expect(result.value.status).toBe(200);expect(result.value.body.organizations[0].admins[0].actions_7).toBe(1);expect(result.value.body.organizations[0].active_days_7).toBe(1);
  });
  it('keeps one state/day row and increments atomically without replaying a batch', async () => {
    expect(await record()).toEqual({ accepted: true });
    expect(await record()).toEqual({ accepted: true, duplicate: true });
    await db.exec("UPDATE org_admin_usage_state SET last_received_at=now()-interval '20 seconds';");
    await record({ sequence:2,actions:{'student.create.success':2} });
    const rows = (await db.query<any>('SELECT * FROM org_admin_usage_daily')).rows;
    expect(rows).toHaveLength(1); expect(rows[0].actions['student.create.success']).toBe(3);
    expect((await db.query('SELECT * FROM org_admin_usage_state')).rows).toHaveLength(1);
    expect((await report(1)).organizations[0].admins[0].first_actions['student.create']).toBeTruthy();
  });
  it('limits ordinary write frequency across multiple tabs without rejecting the first important error', async () => {
    await record();
    expect(await record({ client:22 })).toEqual({ accepted:false,retry_after:15 });
    expect(await record({ client:22,errors:[error()] })).toEqual({ accepted:true });
    expect(await record({ client:22,sequence:2,errors:[error()] })).toEqual({ accepted:false,retry_after:15 });
  });
  it('does not count background failures as human activity', async () => {
    await record({ active:false,actions:{},errors:[error()] });
    const state = (await db.query<any>('SELECT * FROM org_admin_usage_state')).rows[0];
    expect(state.last_active_at).toBeNull(); expect(state.last_action_at).toBeNull(); expect(state.last_module).toBeNull();
    expect((await db.query<any>('SELECT active FROM org_admin_usage_daily')).rows[0].active).toBe(false);
  });
  it('updates a module last-use timestamp during real activity without another navigation',async()=>{
    await record();await db.exec("UPDATE org_admin_usage_state SET last_received_at=now()-interval '20 seconds',module_last_used='{\"students\":\"2026-01-01T00:00:00Z\"}';");
    await record({sequence:2,modules:{},actions:{}});
    const state=(await db.query<any>('SELECT module_last_used FROM org_admin_usage_state')).rows[0];
    expect(Date.parse(state.module_last_used.students)).toBeGreaterThan(Date.now()-60_000);
  });
  it('rejects cross-organization and suspended memberships inside the database transaction', async () => {
    await expect(record({ org:2 })).rejects.toThrow(/Inactive organization/);
    await db.exec("UPDATE organization_admins SET status='suspended';");
    await expect(record()).rejects.toThrow(/Inactive organization/);
    expect((await db.query('SELECT * FROM org_admin_usage_state')).rows).toHaveLength(0);
  });
  it('isolates selected organization details and excludes demo organizations by default', async () => {
    await record({ errors:[error()] });
    await record({ org:2,user:12 });
    const selected = await report(2);
    expect(selected.organizations).toHaveLength(1); expect(selected.organizations[0].id).toBe(id(2));
    expect(selected.errors).toEqual([]); expect(JSON.stringify(selected)).not.toContain('a@example.com');
    await db.exec("UPDATE organizations SET name='Demo School' WHERE name='Agency B';");
    expect((await report()).total).toBe(1);
  });
  it('counts active organization days once even when two admins use the same day', async () => {
    await db.exec(`INSERT INTO organization_admins(organization_id,user_id) VALUES ('${id(1)}','${id(12)}');`);
    await record(); await record({ user:12 });
    const org = (await report(1)).organizations[0];
    expect(org.active_days_7).toBe(1); expect(org.admins).toHaveLength(2);
  });
  it('groups identical errors and retains a bounded sample separately from the 90-day counter', async () => {
    await record({ errors:[error()] });
    await db.exec("UPDATE org_admin_usage_state SET last_received_at=now()-interval '20 seconds';");
    await record({ sequence:2,errors:[{...error(),count:3}] });
    const group = (await report(1)).errors[0]; expect(group.occurrences).toBe(4); expect(group.sample.release).toBe('release-1');
    await db.exec("UPDATE org_admin_error_daily SET day=current_date-20,last_seen_at=now()-interval '20 days';");
    await db.query('SELECT cleanup_org_admin_telemetry()');
    const kept = (await db.query<any>('SELECT occurrences,sample FROM org_admin_error_daily')).rows[0];
    expect(kept.occurrences).toBe(4); expect(kept.sample).toBeNull();
  });
  it('runs retention independently of new logs and marks successful cleanup', async () => {
    await record({ errors:[error()] });
    await db.exec("UPDATE org_admin_usage_daily SET day=current_date-366; UPDATE org_admin_error_daily SET day=current_date-91; UPDATE org_admin_telemetry_cursors SET updated_at=now()-interval '3 days';");
    await db.exec("INSERT INTO support_vercel_log_events VALUES ('project','req','/api/book',500,'error',now()-interval '15 days','old');");
    const cleaned = (await db.query<any>('SELECT cleanup_org_admin_telemetry() result')).rows[0].result;
    expect(cleaned).toEqual({daily_deleted:1,errors_deleted:1,cursors_deleted:1,logs_deleted:1});
    expect((await report()).last_cleanup_at).toBeTruthy();
  });
  it('filters harmless Node deprecation logs while preserving real 5xx failures', async () => {
    await db.exec("INSERT INTO support_vercel_log_events VALUES ('project','noise','/api/book',200,'error',now(),'DEP0169 url.parse'),('project','real','/api/book',500,'error',now(),'DEP0169');");
    expect((await report()).server_errors[0].occurrences).toBe(1);
  });
  it('denies browser roles every table and RPC and permits the service role', async () => {
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role};`);
      try {
        await expect(record()).rejects.toThrow(/permission denied/);
        await expect(report()).rejects.toThrow(/permission denied/);
        await expect(db.query('SELECT cleanup_org_admin_telemetry()')).rejects.toThrow(/permission denied/);
        for (const table of ['org_admin_usage_state','org_admin_usage_daily','org_admin_error_daily','org_admin_telemetry_cursors','org_admin_telemetry_config']) await expect(db.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
      } finally { await db.exec('RESET ROLE;'); }
    }
    await db.exec('SET ROLE service_role;');
    try { expect((await record()).accepted).toBe(true); expect((await report()).total).toBe(2); } finally { await db.exec('RESET ROLE;'); }
  });
});
