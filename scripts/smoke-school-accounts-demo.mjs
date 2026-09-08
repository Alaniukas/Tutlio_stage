import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const env=parseEnv(readFileSync('.env.local','utf8'));
const origin='https://cuhciqwmqfuajeeqjjbm.supabase.co';
const org='c3a00000-7e57-4000-8000-000000000001';
assert.equal(env.VITE_SUPABASE_URL?.replace(/\/$/,''),origin);
for(const k of ['SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_ANON_KEY'])process.env[k]=env[k];
process.env.VITE_SUPABASE_URL=process.env.SUPABASE_URL=origin;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async (input,init={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin!==origin||!/^\/(rest|auth)\/v1\//.test(url.pathname)||/\/(invite|recover|signup|otp|resend)$/.test(url.pathname))throw Error('Smoke network guard blocked request');
 const response=await nativeFetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok && url.pathname.startsWith('/rest/v1/')){
  const error=await response.clone().json();console.error('Demo database error',url.pathname,error.code,error.message);
 }
 return response;
};
const options={auth:{persistSession:false,autoRefreshToken:false}};
const db=createClient(origin,env.SUPABASE_SERVICE_ROLE_KEY,options);
const users=[];const clients=[];const checks=[];
const studentId=randomUUID();const sessionId=randomUUID();const suffix=randomUUID();
let studentCreated=false;
async function checked(p){const r=await p;if(r.error)throw Error(r.error.message);return r.data;}
async function invoke(handler,token,body,method='POST'){
 let code=200,data;await handler({method,headers:{authorization:`Bearer ${token}`},body,query:body},{setHeader(){},status(n){code=n;return this;},json(v){data=v;return this;}});
 assert.equal(code,200,JSON.stringify(data));return data;
}
async function login(email,password){const client=createClient(origin,env.VITE_SUPABASE_ANON_KEY,options);clients.push(client);return {client,...await checked(client.auth.signInWithPassword({email,password}))};}
try{
 const organization=await checked(db.from('organizations').select('id,name').eq('id',org).single());assert.equal(organization.name,'Demo Mokykla');
 const tutors=await checked(db.from('profiles').select('id').eq('organization_id',org).limit(1));assert.ok(tutors.length);
 const adminEmail=`qa-school-admin-${suffix}@example.invalid`;const adminPassword=randomUUID()+'aA1!';
 const admin=await checked(db.auth.admin.createUser({email:adminEmail,password:adminPassword,email_confirm:true,app_metadata:{provisioned_by_organization:org},user_metadata:{full_name:'Disposable Demo QA admin'}}));users.push(admin.user.id);
 await checked(db.from('organization_admins').insert({user_id:admin.user.id,organization_id:org,role:'admin',status:'active',permissions:{},accepted_at:new Date().toISOString()}));
 await checked(db.from('students').insert({id:studentId,tutor_id:tutors[0].id,organization_id:org,full_name:'Disposable Demo QA child',email:`qa-school-child-${suffix}@example.invalid`,payer_name:'Disposable Demo QA parent',payer_email:`qa-school-parent-${suffix}@example.invalid`,payment_payer:'parent'}));studentCreated=true;
 const adminLogin=await login(adminEmail,adminPassword);
 const {default:provision}=await import('../api/admin-student-account.ts');
 const {default:change}=await import('../api/change-temporary-password.ts');
 for(const role of ['parent','student']){
  const account=await invoke(provision,adminLogin.session.access_token,{student_id:studentId,role});users.push(account.userId);
  const signed=await login(account.email,account.temporaryPassword);assert.equal(signed.user.app_metadata.temporary_password,true);
  const nextPassword=randomUUID()+'aA1!';await invoke(change,signed.session.access_token,{password:nextPassword});
  const changed=await login(account.email,nextPassword);assert.equal(changed.user.app_metadata.temporary_password,false);
  if(role==='student'){const p=await checked(db.from('profiles').select('organization_id').eq('id',account.userId).single());assert.equal(p.organization_id,null);}
  checks.push(`${role}: provision, password login, forced-password flag, password change and new login passed`);
 }
 const state=await invoke(provision,adminLogin.session.access_token,{student_id:studentId},'GET');assert.equal(state.studentConnected,true);assert.equal(state.parents.length,1);checks.push('Both independent accounts linked to the Demo child');
 await checked(db.from('sessions').insert({id:sessionId,tutor_id:tutors[0].id,student_id:studentId,start_time:new Date(Date.now()-7200000).toISOString(),end_time:new Date(Date.now()-3600000).toISOString(),status:'completed',price:0,paid:false}));
 const {default:confirm}=await import('../api/confirm-session-status.ts');
 await invoke(confirm,adminLogin.session.access_token,{sessionId,status:'completed',confirmExisting:true});
 const evidence=await checked(db.from('sessions').select('status_confirmed_at,status_confirmed_by').eq('id',sessionId).single());
 assert.ok(evidence.status_confirmed_at);assert.equal(evidence.status_confirmed_by,admin.user.id);
 const repeated=await invoke(confirm,adminLogin.session.access_token,{sessionId,status:'completed',confirmExisting:true});assert.equal(repeated.alreadyConfirmed,true);
 checks.push('Explicit school outcome confirmation and idempotent repeated confirmation passed');
}finally{
 for(const c of clients){await c.auth.signOut({scope:'global'});}
 if(studentCreated){await checked(db.from('sessions').delete().eq('id',sessionId).eq('student_id',studentId));await checked(db.from('parent_students').delete().eq('student_id',studentId));await checked(db.from('students').delete().eq('id',studentId).eq('organization_id',org));}
 for(const id of users.reverse()){
  await checked(db.from('organization_admins').delete().eq('user_id',id).eq('organization_id',org));
  await checked(db.from('parent_profiles').delete().eq('user_id',id));
  await checked(db.from('profiles').delete().eq('id',id));
  await checked(db.auth.admin.deleteUser(id));
 }
 checks.push(`Cleaned ${users.length} disposable Auth users and Demo student; no emails sent`);
 writeFileSync('tmp/school-support-review/demo-account-smoke.json',JSON.stringify({at:new Date().toISOString(),checks},null,2));console.log(checks.join('\n'));
}
