import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({features:{school_family_portal:true} as Record<string,unknown>,entityType:'school',send:vi.fn(),push:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from(table:string){
  const result=()=>({data:table==='organizations'?{name:'Family QA School',entity_type:state.entityType,features:state.features,preferred_locale:'en'}:null,error:null});
  const query:any={select:()=>query,eq:()=>query,limit:()=>query,maybeSingle:async()=>result(),then:(resolve:any)=>resolve(result())};return query;
}})}));
vi.mock('resend',()=>({Resend:class{emails={send:state.send};}}));
vi.mock('../../api/_lib/sendPush',()=>({sendPushForEmail:state.push}));
vi.mock('../../api/_lib/schoolMonthlyInvoiceDelivery.js',()=>({
  schoolMonthlyInvoiceIdempotencyKey:(id:string)=>`school-monthly-invoice/${id}`,
  deliverSchoolMonthlyInvoiceOnce:async(params:any)=>{const outcome=await params.send(params.payload,`school-monthly-invoice/${params.invoiceId}`);
    return outcome.error?{sent:false,reason:outcome.error}:{sent:true,id:outcome.id};},
}));
vi.setConfig({testTimeout:30000});
beforeEach(()=>{vi.clearAllMocks();state.features={school_family_portal:true};state.entityType='school';
  vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL','0');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','family-email-test-key');
  vi.stubEnv('SUPABASE_URL','https://family-test.invalid');vi.stubEnv('RESEND_API_KEY','mock-provider-key');
  state.send.mockResolvedValue({data:{id:'mock-message'},error:null});state.push.mockResolvedValue(undefined);});
afterEach(()=>vi.unstubAllEnvs());
async function send(type:string, extraData:Record<string,unknown>={}){
  const {default:handler}=await import('../../api/send-email');
  const result={statusCode:0,body:null as any};
  const response:any={status(code:number){result.statusCode=code;return this;},json(body:any){result.body=body;return this;},setHeader(){return this;}};
  await handler({method:'POST',headers:{'x-internal-key':'family-email-test-key'},query:{},body:{type,to:'verified@example.test',locale:'en',
    ...(type==='school_monthly_invoice'?{idempotencyKey:'school-monthly-invoice/qa-invoice'}:{}),
    data:{organizationId:'qa-family-school',studentName:'QA Child',parentName:'QA Parent',tutorName:'QA Teacher',date:'2026-09-28',time:'14:00',
      duration:45,price:15,comment:'QA task',registerLink:'https://tutlio.lt/parent-register?token=qa',schoolName:'Family QA School',
      invoiceId:'qa-invoice',monthLabel:'September 2026',totalEur:15,amount:15,rows:[],...extraData}}} as any,response);
  return result;
}
it.each(['booking_confirmation','recurring_booking_confirmation','session_comment_added','school_extra_first_lesson_invite','session_student_no_show'])
  ('suppresses routine %s under the private family portal',async(type)=>{
    expect(await send(type)).toEqual({statusCode:200,body:{success:true,skipped:true,reason:'school_family_digest_policy'}});
    expect(state.send).not.toHaveBeenCalled();expect(state.push).not.toHaveBeenCalled();
  });
it.each(['parent_invite','school_contract','school_monthly_invoice'])('retains account, contract and invoice mail: %s',async(type)=>{
  const result=await send(type);expect(result.statusCode).toBe(200);expect(result.body.skipped).not.toBe(true);
  expect(state.send).toHaveBeenCalledTimes(1);
});
it.each(['disabled','preparation','company'])('keeps routine booking behavior for %s',async(mode)=>{
  if(mode==='disabled')state.features={school_family_portal:false};
  if(mode==='preparation')state.features={school_family_accounts_setup:true};
  if(mode==='company')state.entityType='company';
  expect((await send('booking_confirmation')).statusCode).toBe(200);expect(state.send).toHaveBeenCalledTimes(1);
});

it('replaces individual homework emails with the digest without provisioning private accounts',async()=>{
  state.features={school_join_and_material_notifications:true};
  expect(await send('session_comment_added')).toEqual({statusCode:200,body:{success:true,skipped:true,reason:'school_join_material_policy'}});
  expect(state.send).not.toHaveBeenCalled();expect(state.push).not.toHaveBeenCalled();
});
it.each(['teacher','student','payer'])('keeps the full %s reminder with joining as its primary action',async(mode)=>{
  state.features={school_join_and_material_notifications:true};
  const data={isTutor:mode==='teacher',meetingLink:'https://meet.google.com/same',recipientName:'QA Recipient',otherName:'QA Attendee'};
  const result=await send(mode==='payer'?'session_reminder_payer':'session_reminder',data);
  expect(result.statusCode).toBe(200);expect(result.body.skipped).not.toBe(true);
  expect(state.send).toHaveBeenCalledTimes(1);
  const html=state.send.mock.calls[0][0].html;
  expect(html).toContain('https://meet.google.com/same');
  expect(html).toMatch(/<h1>[^<]*[Ss]ession approaching/);
  expect(html).toContain('45 min');
  expect(html).toContain('padding:14px 32px');
  expect(html).not.toContain('Open session in calendar');
  expect(html).not.toContain('/parent/calendar');
  expect(html).not.toContain('/student/sessions');
});
it.each(['teacher','student','payer'])('retains the in-person %s reminder without fabricating a meeting link',async(mode)=>{
  state.features={school_join_and_material_notifications:true};
  const result=await send(mode==='payer'?'session_reminder_payer':'session_reminder',{isTutor:mode==='teacher'});
  expect(result.statusCode).toBe(200);expect(state.send).toHaveBeenCalledTimes(1);
  const html=state.send.mock.calls[0][0].html;
  expect(html).not.toContain('meet.google.com');expect(html).not.toContain('/api/join-session');
  if(mode==='teacher')expect(html).toContain('Open session in calendar');
});
it.each(['teacher','student','payer'])('keeps the tracked %s join URL on the primary reminder button',async(mode)=>{
  state.features={school_join_and_material_notifications:true};
  const sessionId='11111111-1111-4111-8111-111111111111';
  await send(mode==='payer'?'session_reminder_payer':'session_reminder',{
    sessionId,isTutor:mode==='teacher',meetingLink:'https://meet.google.com/same',
    homeworkUrl:'https://tutlio.lt/school-homework?student=qa&t=qa',
  });
  const html=state.send.mock.calls[0][0].html;
  const primaryLink=html.match(/<a href="([^"]+)"[^>]*style="[^"]*padding:14px 32px[^>]*>/)?.[1];
  expect(primaryLink).toBeDefined();
  const tracked=new URL(primaryLink!.replaceAll('&amp;','&'));
  expect(tracked.pathname).toBe('/api/join-session');
  expect(tracked.searchParams.get('sid')).toBe(sessionId);
  expect(tracked.searchParams.get('role')).toBe(mode==='teacher'?'tutor':'student');
  expect(tracked.searchParams.get('t')).toBeTruthy();
  if(mode==='teacher')expect(html).not.toContain('school-homework');
});
it.each(['booking_confirmation','recurring_booking_confirmation','school_extra_first_lesson_invite','session_student_no_show',
  'lesson_rescheduled','session_cancelled_parent','parent_invite','school_contract','school_monthly_invoice'])('retains %s with material digests',async(type)=>{
  state.features={school_join_and_material_notifications:true};
  expect((await send(type)).statusCode).toBe(200);expect(state.send).toHaveBeenCalledTimes(1);
});
