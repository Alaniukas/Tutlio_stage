import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import StudentAccountSetup from '@/components/company/StudentAccountSetup';
import TemporaryPasswordGate from '@/components/TemporaryPasswordGate';
import ExtraLessonsOfferDialog from '@/components/company/ExtraLessonsOfferDialog';
import ClassGroupFormDialog from '@/components/company/ClassGroupFormDialog';
import {OrgEntityProvider} from '@/contexts/OrgEntityContext';
import {loadLocaleDict} from '@/lib/i18n';
import '../proklase/style.css';
let connected=false;let parents:any[]=[];
const requests:any[]=[];(window as any).__qa={requests};
window.fetch=async(input,init)=>{
 const url=String(input),body=init?.body?JSON.parse(String(init.body)):null;requests.push({url,body,method:init?.method||'GET'});
 let data:any={};
 if(url.startsWith('/api/admin-student-account')) {
  if(body){if(body.role==='student')connected=true;else parents=[{email:'qa-parent@example.test'}];data={role:body.role,userId:'qa-new',email:body.role==='student'?'qa-child@example.test':'qa-parent@example.test',temporaryPassword:'QA-only-temporary-123!'};}
  else data={studentConnected:connected,parents};
 }else if(url==='/api/school-individual-subjects')data={subjects:[{id:'subject-1',name:'Vokiečių kalba',tutor_name:'QA Mokytoja',duration_minutes:60,price:20}]};
 else if(url==='/api/school-class-groups')data={ok:true};
 else if(url==='/api/change-temporary-password')data={ok:true};
 else if(url==='/api/extra-lessons-contract-offer')data={contractNumber:'QA-1',emailSent:true};
 else throw new Error('Unexpected network access: '+url);
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
const slots=[1,3,5].map(weekday=>({weekday,start_time:'16:00',end_time:'16:45'}));
const group={id:'g1',name:'QA Grupė',tutor_id:'t1',school_year_start:'2026-09-01',school_year_end:'2027-06-01',slots,members:[{student_id:'s1',student:{full_name:'QA Mokinys'}}]};
function Page(){const [open,setOpen]=useState(true);const [saved,setSaved]=useState(false);const view=new URLSearchParams(location.search).get('view');
return <MemoryRouter><OrgEntityProvider value="school"><div className="min-h-screen bg-gray-50 p-4"><p>Local QA: fictional data, no external services</p>
{view==='groups'?<ClassGroupFormDialog open={open} onOpenChange={setOpen} mode="edit" group={group} students={[{id:'s1',full_name:'QA Mokinys'}]} tutors={[{id:'t1',full_name:'QA Mokytoja'}]} defaultTutorId="t1" canEditMembers onSaved={()=>setSaved(true)}/>:view==='offer'?<ExtraLessonsOfferDialog open={open} onOpenChange={setOpen} organizationId="qa" students={[{id:'s1',full_name:'QA Mokinys'}]} groups={[group]} onCreated={()=>setSaved(true)}/>:view==='password'?<TemporaryPasswordGate><p>Prepared parent portal is accessible</p></TemporaryPasswordGate>:<StudentAccountSetup studentId="s1"/>}
{saved&&<p role="status">Saved successfully</p>}</div></OrgEntityProvider></MemoryRouter>}
await loadLocaleDict('lt');createRoot(document.getElementById('root')!).render(<Page/>);
