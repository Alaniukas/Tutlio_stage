import { describe, expect, it } from 'vitest';
import { enrichTelemetryReport, parseTelemetryBatch, telemetryModule, type TelemetryReport, type TelemetryOrgReport } from '../../src/lib/orgAdminTelemetryShared';

const now = Date.parse('2026-10-13T12:00:00Z');
const days = (count: number) => new Date(now-count*86_400_000).toISOString();
const batch = () => ({ clientId:'00000000-0000-4000-8000-000000000001',sequence:1,activeAt:days(0),lastModule:'students',lastAction:'student.create',modules:{students:1},actions:{'student.create.success':1},errors:[],release:'test-1' });
export function fixture(): TelemetryReport {
  const org: TelemetryOrgReport = { id:'00000000-0000-4000-8000-000000000011',name:'Test Agency',entity_type:'company',status:'active',created_at:days(20),features:{},is_demo:false,
    admins:[{user_id:'admin-1',full_name:'Admin',email:'admin@example.com',role:'owner',status:'active',permissions:{},first_observed_at:days(20),last_active_at:days(6),last_action_at:days(6),last_action:'student.create',last_module:'students',last_login_at:days(10),first_actions:{},module_last_used:{students:days(6)},active_days_7:1,active_days_30:8,actions_7:0,actions_30:20}],
    active_days_7:1,active_days_30:8,current_week_actions:2,previous_week_actions:10,modules_30:{students:5},actions_30:{'student.create.success':2},errors_7:4,errors_today:4,repeated_errors_today:4 };
  return {started_at:days(30),last_cleanup_at:days(0),last_ingested_at:days(0),total:1,organizations:[org],errors:[],daily:[],server_errors:[]};
}
describe('telemetry protocol and support signals', () => {
  it('recognizes only authenticated application surfaces including locale prefixes', () => {
    expect(telemetryModule('/school')).toBe('dashboard'); expect(telemetryModule('/lt/company/students/private-id')).toBe('students');
    expect(telemetryModule('/schools/school/groups')).toBe('groups');
    for (const path of ['/schools','/company/login','/student/calendar','/admin','/school-sign']) expect(telemetryModule(path)).toBeNull();
  });
  it('rejects caller-supplied identity and strips arbitrary counters and sensitive diagnostic data', () => {
    expect(parseTelemetryBatch({...batch(),organizationId:'other'},now)).toBeNull();
    const parsed = parseTelemetryBatch({...batch(),modules:{students:2,'Alice Smith':1},actions:{'student.create.success':1,'anything.success':1},errors:[{
      kind:'api',module:'students',code:'http_500',endpoint:'/api/book/private-person?email=secret@example.com',status:500,count:2,
      body:{student:'Alice'},message:'Password=private',frames:['https://secret.example.com/Alice.js:1:2'],breadcrumbs:[{type:'click',path:'/company/students/Alice',action:'Alice Smith',form:'private'}],
    }]},now)!;
    expect(parsed.modules).toEqual({students:2}); expect(parsed.actions).toEqual({'student.create.success':1});
    expect(parsed.errors[0].endpoint).toBe('/api/book'); expect(parsed.errors[0].breadcrumbs).toEqual([{type:'click',path:'/admin-app/students'}]);
    expect(JSON.stringify(parsed)).not.toMatch(/Alice|Password|private|example\.com/);
  });
  it('does not trust stale or future client clocks for the active timestamp', () => {
    expect(parseTelemetryBatch({...batch(),activeAt:days(1)},now)?.activeAt).toBeNull();
    expect(parseTelemetryBatch({...batch(),activeAt:days(-1)},now)?.activeAt).toBeNull();
  });
  it('preserves module context when client-normalized breadcrumbs are sanitized again by the API',()=>{
    const parsed=parseTelemetryBatch({...batch(),errors:[{kind:'api',module:'finance',code:'http_500',endpoint:'/api/generate-invoice',status:500,count:1,breadcrumbs:[{type:'click',path:'/admin-app/finance',action:'send'}]}]},now)!;
    expect(parsed.errors[0].breadcrumbs).toEqual([{type:'click',path:'/admin-app/finance',action:'send'}]);
  });
  it('requires coverage for trends and avoids inactivity claims when no admin was observed', () => {
    const data=fixture(); data.organizations[0].admins[0].first_observed_at=null; data.organizations[0].admins[0].last_active_at=null;
    const org=enrichTelemetryReport(data,now).organizations[0]; expect(org.reasons).toEqual(['repeated_errors']); expect(org.usage_change_percent).toBeNull();
  });
  it('calculates organization inactivity from all current admins and compares matching complete weeks', () => {
    const data=fixture(); data.organizations[0].admins.push({...data.organizations[0].admins[0],user_id:'admin-2',last_active_at:days(0)});
    const org=enrichTelemetryReport(data,now).organizations[0]; expect(org.reasons).not.toContain('inactive'); expect(org.usage_change_percent).toBe(-80);
  });
  it('does not flag different one-off failures as a repeated error', () => {
    const data=fixture(); data.organizations[0].repeated_errors_today=1;
    expect(enrichTelemetryReport(data,now).organizations[0].reasons).not.toContain('repeated_errors');
  });
  it('respects limited administrator permissions and disabled feature onboarding milestones', () => {
    const data=fixture(); data.organizations[0].admins[0].role='accountant';
    const org=enrichTelemetryReport(data,now).organizations[0]; expect(org.missing_milestones).toEqual(['invoice.create']); expect(org.expected_modules).not.toContain('students'); expect(org.expected_modules).not.toContain('groups');
  });
  it('suppresses support flags for demo and suspended organizations', () => {
    for(const patch of [{is_demo:true},{status:'suspended'}]) { const data=fixture(); Object.assign(data.organizations[0],patch); expect(enrichTelemetryReport(data,now).organizations[0].reasons).toEqual([]); }
  });
});
