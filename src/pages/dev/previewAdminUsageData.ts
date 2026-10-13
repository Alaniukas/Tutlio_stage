import type { TelemetryReport, TelemetryOrgReport } from '@/lib/orgAdminTelemetryShared';

const ago = (days: number) => new Date(Date.now()-days*86_400_000).toISOString();
function organization(id: string, name: string, inactive: boolean): TelemetryOrgReport {
  const last = ago(inactive ? 6 : 0);
  return {id,name,entity_type:inactive?'company':'school',status:'active',created_at:ago(20),features:{school_class_groups:true},is_demo:false,
    admins:[{user_id:`${id}-admin`,full_name:inactive?'Administratorė A':'Administratorius B',email:'admin@example.test',role:'owner',status:'active',permissions:{},first_observed_at:ago(20),last_active_at:last,last_action_at:last,last_action:'student.create',last_module:'students',last_login_at:ago(10),first_actions:{'student.create':ago(18),'tutor.invite':ago(17),'group.create':ago(15)},module_last_used:{students:last,schedule:ago(8),finance:ago(9)},active_days_7:inactive?1:5,active_days_30:12,actions_7:inactive?2:24,actions_30:60}],
    active_days_7:inactive?1:5,active_days_30:12,current_week_actions:inactive?2:24,previous_week_actions:20,
    modules_30:{students:15,schedule:28,finance:3},actions_30:{'student.create.success':6,'session.create.success':20,'invoice.send.success':3,'invoice.send.failure':4,'export.success':2},errors_7:inactive?4:0,errors_today:inactive?4:0,repeated_errors_today:inactive?4:0,
  };
}
export function previewAdminUsageData(): TelemetryReport {
  return {started_at:ago(30),last_cleanup_at:ago(0),last_ingested_at:ago(0),total:2,
    organizations:[organization('00000000-0000-4000-8000-000000000001','Pavyzdinė agentūra',true),organization('00000000-0000-4000-8000-000000000002','Pavyzdinė mokykla',false)],
    errors:[{fingerprint:'a'.repeat(64),module:'finance',kind:'supabase',code:'db_57014',endpoint:'/rest/v1/invoices',operation:'invoice.send',occurrences:4,affected_admins:1,first_seen_at:ago(2),last_seen_at:ago(0),sample:{kind:'supabase',module:'finance',code:'db_57014',endpoint:'/rest/v1/invoices',status:400,count:1,release:'preview-1',frames:[],breadcrumbs:[{type:'click',path:'/admin-app/finance',action:'send'}]}}],
    daily:Array.from({length:20},(_,index)=>({day:ago(20-index).slice(0,10),active_admins:1,actions:1+index%7,errors:index===19?4:0})),
    server_errors:[{path:'/api/generate-invoice',status_code:500,occurrences:2,last_seen_at:ago(0),message:'Invoice operation failed',vercel_id:'preview::request'}],
  };
}
