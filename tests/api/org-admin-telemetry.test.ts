// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),client:vi.fn(),rpc:vi.fn(),logs:vi.fn()}));
vi.mock('../../api/_lib/auth.js',()=>({verifyRequestAuth:mocks.auth}));
vi.mock('../../api/_lib/orgAdminAccess.js',()=>({getOrgAdminAccessByUserId:mocks.access}));
vi.mock('../../api/_lib/supportPersistence.js',()=>({getSupportServiceClient:mocks.client}));
vi.mock('../../api/_lib/supportVercelLogs.js',()=>({getCorrelatedSupportVercelLogs:mocks.logs}));
import ingest from '../../api/org-admin-telemetry';
import usage from '../../api/admin-usage';
import cleanup from '../../api/cleanup-admin-telemetry';

const user='00000000-0000-4000-8000-000000000011',org='00000000-0000-4000-8000-000000000001';
const body=()=>({clientId:'00000000-0000-4000-8000-000000000021',sequence:1,activeAt:new Date().toISOString(),lastModule:'students',lastAction:'student.create',modules:{students:1},actions:{'student.create.success':1},errors:[],release:'release-1'});
function res() { const result={status:200,body:null as any}; const response:any={setHeader:vi.fn(),status:(status:number)=>{result.status=status;return response;},json:(body:any)=>{result.body=body;return response;}};return {response,result}; }
beforeEach(()=>{
  vi.stubEnv('ADMIN_SECRET','admin-secret'); vi.stubEnv('CRON_SECRET','cron-secret');
  mocks.auth.mockReset().mockResolvedValue({userId:user,isInternal:false,lastSignInAt:'2026-10-10T12:00:00Z'});
  mocks.access.mockReset().mockResolvedValue({userId:user,organizationId:org,status:'active'});
  mocks.rpc.mockReset().mockResolvedValue({data:{accepted:true},error:null}); mocks.client.mockReset().mockReturnValue({rpc:mocks.rpc}); mocks.logs.mockReset().mockResolvedValue([]);
});
afterEach(()=>vi.unstubAllEnvs());
describe('admin telemetry API boundaries',()=>{
  it('derives identities and login timestamps from verified server context',async()=>{
    const {response,result}=res();await ingest({method:'POST',headers:{},body:body()} as any,response);
    expect(result.status).toBe(200); expect(mocks.rpc).toHaveBeenCalledWith('record_org_admin_telemetry',expect.objectContaining({p_organization_id:org,p_user_id:user,p_login_at:'2026-10-10T12:00:00Z'}));
  });
  it('rejects identity injection and oversized payloads without touching storage',async()=>{
    for(const [payload,status] of [[{...body(),organizationId:'other'},400],[{...body(),release:'x'.repeat(25000)},413]] as const){const {response,result}=res();await ingest({method:'POST',headers:{},body:payload} as any,response);expect(result.status).toBe(status);}
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects anonymous, internal, and inactive callers',async()=>{
    for(const auth of [null,{userId:null,isInternal:true}]){mocks.auth.mockResolvedValue(auth);const {response,result}=res();await ingest({method:'POST',headers:{},body:body()} as any,response);expect(result.status).toBe(401);}
    mocks.auth.mockResolvedValue({userId:user,isInternal:false});mocks.access.mockResolvedValue(null);
    const {response,result}=res();await ingest({method:'POST',headers:{},body:body()} as any,response);expect(result.status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('hashes sanitized errors and fails quietly if telemetry storage is unavailable',async()=>{
    mocks.rpc.mockResolvedValue({error:{code:'42P01',message:'private database details'}});
    const {response,result}=res();await ingest({method:'POST',headers:{},body:{...body(),errors:[{kind:'api',module:'students',code:'http_500',endpoint:'/api/save?token=private',status:500,count:1,message:'private data'}]}} as any,response);
    expect(result.status).toBe(503);expect(JSON.stringify(result.body)).not.toContain('private');
    const args=mocks.rpc.mock.calls[0][1];expect(args.p_errors[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(args)).not.toContain('private');
  });
  it('requires the platform secret before reading usage or correlated logs',async()=>{
    const {response,result}=res();await usage({method:'GET',headers:{authorization:'Bearer token'},query:{}} as any,response);
    expect(result.status).toBe(401);expect(mocks.client).not.toHaveBeenCalled();expect(mocks.logs).not.toHaveBeenCalled();
  });
  it('caps list inputs and passes an explicit project and selected organization scope',async()=>{
    vi.stubEnv('VERCEL_PROJECT_ID','project-1');mocks.rpc.mockResolvedValue({data:{started_at:new Date().toISOString(),last_cleanup_at:null,last_ingested_at:null,total:0,organizations:[],errors:[],daily:[],server_errors:[]},error:null});
    const {response,result}=res();await usage({method:'GET',headers:{'x-admin-secret':'admin-secret'},query:{organization:org,limit:'999',offset:'-1'}} as any,response);
    expect(result.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('org_admin_usage_report',expect.objectContaining({p_organization_id:org,p_limit:50,p_offset:0,p_project_id:'project-1'}));
  });
  it('guards independent retention with the cron secret',async()=>{
    const denied=res();await cleanup({method:'GET',headers:{},query:{}} as any,denied.response);expect(denied.result.status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({data:{daily_deleted:2},error:null}); const allowed=res();await cleanup({method:'GET',headers:{authorization:'Bearer cron-secret'},query:{}} as any,allowed.response);expect(allowed.result.body).toEqual({ok:true,daily_deleted:2});
  });
});
