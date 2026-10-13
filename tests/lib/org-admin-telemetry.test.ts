import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureSupabaseTelemetry, flushOrgAdminTelemetry, orgAdminTelemetryFetch, recordOrgAdminAction, recordOrgAdminRuntimeError,
  setOrgAdminTelemetryAuth, startOrgAdminTelemetry, withOrgAdminTelemetryOperation,
} from '../../src/lib/orgAdminTelemetry';

vi.mock('../../src/lib/supportDiagnostics.js', () => ({acquireSupportDiagnostics:()=>()=>{},clearSupportDiagnostics:()=>{},getSupportDiagnostics: () => [{type:'click',path:'/company/students/private-name',action:'save',form:'secret'}]}));
const user='00000000-0000-4000-8000-000000000011';
const org='00000000-0000-4000-8000-000000000001';
let stop: (()=>void) | undefined;
let fetcher: ReturnType<typeof vi.fn>;
let packets: any[];
const settle = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
function boot() { setOrgAdminTelemetryAuth(user,'token'); stop=startOrgAdminTelemetry({userId:user,organizationId:org,enabled:true,release:'test-1'}); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  window.history.replaceState(null,'','/company/students'); localStorage.clear(); sessionStorage.clear(); packets=[];
  fetcher=vi.fn(async (input: RequestInfo | URL,init?: RequestInit) => {
    if(String(input)==='/api/org-admin-telemetry') packets.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({accepted:true,ok:true}),{headers:{'content-type':'application/json'}});
  });
  vi.stubGlobal('fetch',fetcher);
  configureSupabaseTelemetry('https://project.supabase.co');
});
afterEach(() => { stop?.(); stop=undefined; setOrgAdminTelemetryAuth(null,null); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('bounded admin activity collection', () => {
  it('sends one initial observation and no idle timer updates', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000);
    expect(packets).toHaveLength(1); expect(packets[0].modules).toEqual({students:1});
    await vi.advanceTimersByTimeAsync(15*60_000); expect(packets).toHaveLength(1);
  });
  it('batches actions and genuine interaction instead of writing on every click', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000); packets=[];
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab'}));
    for(let i=0;i<10;i++) recordOrgAdminAction('student.create');
    expect(packets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5*60_000+15_000);
    expect(packets).toHaveLength(1); expect(packets[0].actions).toEqual({'student.create.success':10});
  });
  it('ignores hidden-window input and shares heartbeat throttling across tabs', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000); stop?.();
    boot(); await vi.advanceTimersByTimeAsync(1000);
    expect(packets[1].activeAt).toBeNull();
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    packets=[]; document.dispatchEvent(new KeyboardEvent('keydown',{key:'a'}));
    await vi.advanceTimersByTimeAsync(5*60_000); expect(packets).toHaveLength(0);
  });
  it('records successful mutation only after the server response and excludes automatic background mutations', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000); packets=[];
    await orgAdminTelemetryFetch(fetcher,'https://project.supabase.co/rest/v1/students',{method:'POST'}); await settle();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
    let resolve!: (response: Response)=>void;
    const pending=orgAdminTelemetryFetch(vi.fn(()=>new Promise<Response>(done=>{resolve=done;})),'https://project.supabase.co/rest/v1/students',{method:'POST',body:'{"email":"private@example.com"}'});
    await flushOrgAdminTelemetry(); expect(packets).toEqual([]);
    resolve(new Response('{}',{headers:{'content-type':'application/json'}})); await pending; await settle(); await flushOrgAdminTelemetry();
    expect(packets[0].actions).toEqual({'student.create.success':1}); expect(JSON.stringify(packets)).not.toContain('private@example.com');
  });
  it('captures direct Supabase failures and semantic API errors returned with HTTP 200', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000); packets=[];
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
    const dbFailure=vi.fn(async()=>new Response(JSON.stringify({code:'57014',message:'private@example.com'}),{status:400,headers:{'content-type':'application/json'}}));
    const response=await orgAdminTelemetryFetch(dbFailure,'https://project.supabase.co/rest/v1/students?email=private@example.com',{method:'POST'});
    expect(response.status).toBe(400); await settle();
    await orgAdminTelemetryFetch(vi.fn(async()=>new Response('{"ok":false,"error":"private name"}',{headers:{'content-type':'application/json'}})),'/api/invite-tutor',{method:'POST'});
    await settle(); await flushOrgAdminTelemetry();
    const errors=packets.flatMap(packet=>packet.errors); expect(errors.map(error=>error.code)).toContain('db_57014'); expect(errors.map(error=>error.code)).toContain('operation_failed');
    expect(JSON.stringify(packets)).not.toMatch(/private|email=/);
    expect(packets.flatMap(packet=>Object.keys(packet.actions))).toContain('tutor.invite.failure');
  });
  it('excludes its own transport and does not change rejected application promises', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000); packets=[];
    const failure=new Error('offline'); const transport=vi.fn().mockRejectedValue(failure);
    await expect(orgAdminTelemetryFetch(transport,'/api/org-admin-telemetry',{method:'POST'})).rejects.toBe(failure);
    await flushOrgAdminTelemetry(); expect(packets).toEqual([]);
  });
  it('sends crash metadata without error messages, paths containing form data, or raw stacks', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000); packets=[];
    const error=new TypeError('private@example.com'); error.stack='TypeError: private@example.com\n at save (https://app.test/assets/admin-abc123.js:42:3)';
    recordOrgAdminRuntimeError(error); await settle();
    expect(packets[0].errors[0].frames).toEqual(['/assets/admin-abc123.js:42:3']);
    expect(JSON.stringify(packets)).not.toMatch(/private|secret|example\.com/);
  });
  it('uses the same sequence for uncertain delivery retries', async () => {
    fetcher.mockImplementation(async (input: RequestInfo | URL,init?: RequestInit)=>{
      packets.push(JSON.parse(String(init?.body))); return new Response('{}',{status:503});
    });
    boot(); await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(15*60_000+15_000);
    expect(packets).toHaveLength(2); expect(packets[1].clientId).toBe(packets[0].clientId); expect(packets[1].sequence).toBe(packets[0].sequence);
  });
  it('resumes after an expired access token is refreshed without another auth read',async()=>{
    fetcher.mockImplementationOnce(async (_input,init)=>{packets.push(JSON.parse(String(init?.body)));return new Response('{}',{status:401});});
    boot();await vi.advanceTimersByTimeAsync(1000);setOrgAdminTelemetryAuth(user,'fresh-token');
    await flushOrgAdminTelemetry();expect(packets).toHaveLength(2);expect(packets[0].sequence).toBe(packets[1].sequence);
    expect(fetcher.mock.calls.at(-1)?.[1]?.headers).toMatchObject({Authorization:'Bearer fresh-token'});
  });
  it('drops late responses on account changes and restores the exact original fetch function', async () => {
    boot(); const before=fetcher;
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
    let resolve!: (response: Response)=>void;
    const pending=orgAdminTelemetryFetch(vi.fn(()=>new Promise<Response>(done=>{resolve=done;})),'/api/invite-tutor',{method:'POST'});
    setOrgAdminTelemetryAuth(null,null); resolve(new Response('{}',{headers:{'content-type':'application/json'}})); await pending; await settle();
    expect(window.fetch).toBe(before); expect(packets).toHaveLength(0);
  });
  it('observes export failures without swallowing the original error', async () => {
    boot(); await vi.advanceTimersByTimeAsync(1000); packets=[];
    const failure=new Error('private export data');
    await expect(withOrgAdminTelemetryOperation('export',async()=>{throw failure;})).rejects.toBe(failure);
    await flushOrgAdminTelemetry(); expect(packets[0].actions).toEqual({'export.failure':1}); expect(packets[0].errors[0].code).toBe('operation_failed');
  });
});
