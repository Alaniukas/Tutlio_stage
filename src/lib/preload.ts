import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getCached, setCache, dedupeAsync } from '@/lib/dataCache';
import { startOfMonth, endOfMonth, isAfter, isBefore, addDays, subDays } from 'date-fns';

/** Columns the tutor Dashboard needs (avoid `*` + share one deduped round-trip with Layout preload). */
const TUTOR_DASH_SESSIONS_SELECT =
  'id, student_id, subject_id, start_time, end_time, status, paid, price, topic, created_at, meeting_link, cancellation_reason, payment_status, tutor_comment, show_comment_to_student, is_late_cancelled, cancellation_penalty_amount, penalty_resolution, cancelled_by, no_show_when, credit_applied_amount, lesson_package_id, payment_batch_id, subjects(is_trial, name), student:students(full_name, email, phone, payer_email, payer_phone, grade)';

/** Single in-flight tutor dashboard sessions fetch (Layout preload + Dashboard share the same promise). */
export function tutorDashboardSessionsDeduped(tutorUserId: string) {
  const now = new Date();
  const rangeStart = subDays(now, 90).toISOString();
  const rangeEnd = addDays(now, 366).toISOString();
  return dedupeAsync(`tutor_dash_sessions:${tutorUserId}`, () =>
    supabase
      .from('sessions')
      .select(TUTOR_DASH_SESSIONS_SELECT)
      .eq('tutor_id', tutorUserId)
      .gte('start_time', rangeStart)
      .lte('start_time', rangeEnd)
      .order('start_time', { ascending: true })
      .limit(800),
  );
}

function getAuthUser() {
  return dedupeAsync('auth_user', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  });
}

/** One in-flight `getUser` per wave (StrictMode, UserContext + page both calling auth). */
export function dedupeAuthGetUser(): Promise<User | null> {
  return getAuthUser();
}

/** Parallel `OrgSuspendedBanner` / StrictMode bursts → one round-trip per org id. */
export function orgSuspensionRowDeduped(organizationId: string) {
  return dedupeAsync(`org_sf:${organizationId}`, () =>
    supabase.from('organizations').select('status, features').eq('id', organizationId).maybeSingle(),
  );
}

/** Shared guard + suspended banner paths (students have no profiles.organization_id row). */
export function rpcGetStudentByUserIdDeduped(p_user_id: string) {
  return dedupeAsync(`rpc_gsbuyid:${p_user_id}`, () =>
    supabase.rpc('get_student_by_user_id', { p_user_id }),
  );
}

export function tutorProfileOrgIdDeduped(tutorUserId: string) {
  return dedupeAsync(`prof_org:${tutorUserId}`, () =>
    supabase.from('profiles').select('organization_id').eq('id', tutorUserId).maybeSingle(),
  );
}

/** Coalesces StudentLayout (`null`), StudentSchedule (active kid), preload, Sessions. */
export function rpcGetStudentProfilesDeduped(p_user_id: string, p_student_id: string | null) {
  const sk = p_student_id === undefined || p_student_id === null ? 'null' : p_student_id;
  return dedupeAsync(`rpc_gsprof:${p_user_id}:${sk}`, () =>
    supabase.rpc('get_student_profiles', { p_user_id, p_student_id: p_student_id ?? null }),
  );
}

/** Tutor Layout + useOrgFeatures + useOrgTutorPolicy — vienas `profiles` užklausos skrydis. */
export function tutorSidebarProfileDeduped(userId: string) {
  return dedupeAsync(`prof_tutor_sidebar:${userId}`, () =>
    supabase
      .from('profiles')
      .select('full_name, organization_id, company_commission_percent, has_active_license')
      .eq('id', userId)
      .maybeSingle(),
  );
}

/** `preloadTutorData` stripe / payment laukai (kitas stulpinių rinkinys nei sidebar). */
export function tutorPreloadProfileDeduped(userId: string) {
  return dedupeAsync(`prof_tutor_preload:${userId}`, () =>
    supabase
      .from('profiles')
      .select(
        'full_name, organization_id, stripe_account_id, payment_timing, payment_deadline_hours, subscription_plan, manual_subscription_exempt',
      )
      .eq('id', userId)
      .maybeSingle(),
  );
}

/**
 * Mokėtos „vienišos“ pamokos (dashboard „Paskutiniai mokėjimai“) — vienas in-flight tarp fetchData ir poll.
 * Laiko riba sumažina planner darbą prie didelės istorijos.
 */
export function tutorRecentPaidLessonsDeduped(tutorId: string) {
  const since = subDays(new Date(), 800).toISOString();
  return dedupeAsync(`tutor_recent_paid_lessons:${tutorId}`, () =>
    supabase
      .from('sessions')
      .select('id, start_time, price, topic, lesson_package_id, student:students(full_name)')
      .eq('tutor_id', tutorId)
      .eq('paid', true)
      .is('lesson_package_id', null)
      .is('payment_batch_id', null)
      .neq('status', 'cancelled')
      .gte('start_time', since)
      .order('start_time', { ascending: false })
      .limit(20),
  );
}

/** Tutor Dashboard org tutor „atnaujinimų“ blokas (-7 d.) + ta pati organizacijos eilutė kaip OrgSuspended/useOrgFeatures. */
export function tutorDashboardOrgPackDeduped(tutorUserId: string, organizationId: string) {
  const weekAgo = subDays(new Date(), 7).toISOString();
  return dedupeAsync(`dash_org_feed:${tutorUserId}`, () =>
    Promise.all([
      supabase
        .from('availability')
        .select('id, created_at, is_recurring, day_of_week, start_time, end_time, specific_date, end_date')
        .eq('tutor_id', tutorUserId)
        .eq('created_by_role', 'org_admin')
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('sessions')
        .select('id, created_at, start_time, topic, student:students(full_name), subjects(name)')
        .eq('tutor_id', tutorUserId)
        .eq('created_by_role', 'org_admin')
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(6),
      orgSuspensionRowDeduped(organizationId),
    ]),
  );
}

export function tutorStudentCountEstimatedDeduped(tutorId: string) {
  return dedupeAsync(`tutor_stu_est_count:${tutorId}`, () =>
    supabase.from('students').select('*', { count: 'estimated', head: true }).eq('tutor_id', tutorId),
  );
}

export function tutorRecentPaidPackagesDeduped(tutorId: string) {
  return dedupeAsync(`tutor_recent_pkgs:${tutorId}`, () =>
    supabase
      .from('lesson_packages')
      .select('id, paid_at, total_price, total_lessons, students!student_id(full_name), subjects!subject_id(name)')
      .eq('tutor_id', tutorId)
      .eq('paid', true)
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(20),
  );
}

export function tutorRecentPaidInvoicesDeduped(tutorId: string) {
  return dedupeAsync(`tutor_recent_inv:${tutorId}`, () =>
    supabase
      .from('billing_batches')
      .select('id, paid_at, total_amount, period_start_date, period_end_date, payer_name')
      .eq('tutor_id', tutorId)
      .eq('paid', true)
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(20),
  );
}

export function orgTutorPolicyRowDeduped(organizationId: string) {
  return dedupeAsync(`org_tutor_pol:${organizationId}`, () =>
    supabase
      .from('organizations')
      .select(
        'org_tutor_lesson_edit, org_tutors_can_edit_lesson_settings, invoice_issuer_mode, tutor_license_count, tutor_limit',
      )
      .eq('id', organizationId)
      .maybeSingle(),
  );
}

/** `preloadTutorData` + Calendar + Students — tas pats `students` sąrašas. */
export function tutorStudentsRowsDeduped(tutorId: string) {
  return dedupeAsync(`tutor_students_star:${tutorId}`, () =>
    supabase
      .from('students')
      .select('*, linked_user_id')
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: false }),
  );
}

export function profilePersonalMeetingLinkDeduped(userId: string) {
  return dedupeAsync(`prof_pml:${userId}`, () =>
    supabase.from('profiles').select('personal_meeting_link').eq('id', userId).maybeSingle(),
  );
}

export function tutorFinancePageProfileDeduped(userId: string) {
  return dedupeAsync(`prof_finance_page:${userId}`, () =>
    supabase
      .from('profiles')
      .select(
        'organization_id, stripe_account_id, stripe_onboarding_complete, payment_timing, payment_deadline_hours, min_booking_hours, enable_per_lesson, enable_monthly_billing, enable_prepaid_packages, restrict_booking_on_overdue, enable_per_student_payment_override',
      )
      .eq('id', userId)
      .maybeSingle(),
  );
}

/** Kai UserContext dar neturi profilio — tie patys laukai kaip Calendar buvo traukę vienoje užklausoje. */
export function tutorCalendarFallbackProfileDeduped(userId: string) {
  return dedupeAsync(`prof_cal_fallback:${userId}`, () =>
    supabase
      .from('profiles')
      .select(
        'stripe_account_id, google_calendar_connected, organization_id, personal_meeting_link, subscription_plan, manual_subscription_exempt',
      )
      .eq('id', userId)
      .maybeSingle(),
  );
}

export function tutorSubjectsCalendarDeduped(tutorId: string) {
  return dedupeAsync(`tutor_subj_cal:${tutorId}`, () =>
    supabase
      .from('subjects')
      .select('id, name, duration_minutes, price, color, meeting_link, grade_min, grade_max, is_group, max_students')
      .eq('tutor_id', tutorId),
  );
}

export function tutorStudentPricingAllDeduped(tutorId: string) {
  return dedupeAsync(`tutor_stu_price_all:${tutorId}`, () =>
    supabase.from('student_individual_pricing').select('*').eq('tutor_id', tutorId),
  );
}

export function tutorSubjectPricesRowsAllDeduped(tutorId: string) {
  return dedupeAsync(`tutor_tsp_all:${tutorId}`, () =>
    supabase.from('tutor_subject_prices').select('*').eq('tutor_id', tutorId),
  );
}

export function tutorAvailabilityAllRowsDeduped(tutorId: string) {
  return dedupeAsync(`tutor_avail_all:${tutorId}`, () =>
    supabase.from('availability').select('*').eq('tutor_id', tutorId),
  );
}

export function organizationSubjectTemplatesDeduped(orgId: string) {
  return dedupeAsync(`org_tpl:${orgId}`, () =>
    supabase.from('organizations').select('org_subject_templates').eq('id', orgId).maybeSingle(),
  );
}

function getOrgAdmin(userId: string) {
  return dedupeAsync('org_admin_row', async () => {
    const { data } = await supabase
      .from('organization_admins')
      .select('organization_id, organizations(name, tutor_limit, entity_type)')
      .eq('user_id', userId)
      .maybeSingle();
    return data;
  });
}

let orgPreloadRunning = false;
let tutorPreloadRunning = false;
let studentPreloadRunning = false;

/** Shared with CompanyTutors; v2 excludes org student profiles from tutor preload cache */
export const COMPANY_TUTORS_CACHE_KEY = 'company_tutors_v2';

export async function preloadOrgAdminData() {
  if (orgPreloadRunning) return;
  if (getCached(COMPANY_TUTORS_CACHE_KEY) && getCached('company_students') && getCached('company_sessions')) return;
  orgPreloadRunning = true;

  try {
    const user = await getAuthUser();
    if (!user) return;

    const adminRow = await getOrgAdmin(user.id);
    if (!adminRow) return;

    const org = adminRow.organizations as any;
    const orgId = adminRow.organization_id;

    const [{ data: adminUsers }, { data: tutorData }, { data: inviteData }, { data: linkedStudentsRows }] = await Promise.all([
      supabase
        .from('organization_admins')
        .select('user_id')
        .eq('organization_id', orgId),
      supabase
        .from('profiles')
        .select('id, full_name, email, phone, cancellation_hours, cancellation_fee_percent, reminder_student_hours, reminder_tutor_hours, break_between_lessons, min_booking_hours, company_commission_percent')
        .eq('organization_id', orgId),
      supabase
        .from('tutor_invites')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('linked_user_id, email')
        .eq('organization_id', orgId),
    ]);

    const adminIds = new Set((adminUsers || []).map((a: any) => a.user_id));
    const linkedStudentUserIds = new Set(
      (linkedStudentsRows || [])
        .map((s: { linked_user_id?: string | null }) => s.linked_user_id)
        .filter((id: string | null | undefined): id is string => !!id)
    );
    const linkedStudentEmails = new Set(
      (linkedStudentsRows || [])
        .map((s: { email?: string | null }) => String(s.email || '').trim().toLowerCase())
        .filter((email: string) => email.length > 0)
    );
    // Match CompanyTutors: exclude org admins and org student accounts (linked profiles)
    const visibleTutors = (tutorData || []).filter(
      (t: { id: string; email?: string | null }) =>
        !adminIds.has(t.id) &&
        !linkedStudentUserIds.has(t.id) &&
        !linkedStudentEmails.has(String(t.email || '').trim().toLowerCase())
    );
    const tutorIds = visibleTutors.map((t: any) => t.id);

    if (!getCached(COMPANY_TUTORS_CACHE_KEY)) {
      const enrichedInvites = (inviteData || []).map((inv: any) => ({
        ...inv,
        tutor: (tutorData || []).find((t: any) => t.id === inv.used_by_profile_id) || null,
      }));
      setCache(COMPANY_TUTORS_CACHE_KEY, {
        orgId, tutorLimit: org?.tutor_limit || 0,
        tutors: visibleTutors, invites: enrichedInvites,
      });
    }

    const tutorList = visibleTutors.map((t: any) => ({ id: t.id, full_name: t.full_name }));

    if (tutorIds.length === 0) {
      // Still fetch unassigned org students even when no tutors exist
      if (!getCached('company_students')) {
        const { data: unassignedStudents } = await supabase
          .from('students')
          .select('*, linked_user_id')
          .is('tutor_id', null)
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        setCache('company_students', { students: unassignedStudents || [], tutors: tutorList });
      }
      return;
    }

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [studentsRes, unassignedStudentsRes, sessionsRes] = await Promise.all([
      supabase
        .from('students')
        .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
        .in('tutor_id', tutorIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('*, linked_user_id')
        .is('tutor_id', null)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('*, student:students(full_name), subjects(is_group)')
        .in('tutor_id', tutorIds)
        .gte('start_time', threeMonthsAgo.toISOString())
        .order('start_time', { ascending: false })
        .limit(2000),
    ]);

    if (!getCached('company_students')) {
      const allStudents = [...(studentsRes.data || []), ...(unassignedStudentsRes.data || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCache('company_students', { students: allStudents, tutors: tutorList });
    }

    if (!getCached('company_sessions')) {
      const enriched = (sessionsRes.data || []).map((s: any) => ({
        id: s.id, tutor_id: s.tutor_id, student_id: s.student_id,
        start_time: s.start_time, end_time: s.end_time,
        status: s.status, price: s.price, topic: s.topic,
        paid: s.paid, payment_status: s.payment_status || null,
        cancellation_reason: s.cancellation_reason,
        tutor_name: tutorList.find((t: any) => t.id === s.tutor_id)?.full_name || '–',
        student_name: s.student?.full_name || '–',
        subject_is_group: s.subjects?.is_group ?? null,
      }));
      setCache('company_sessions', { sessions: enriched, tutors: tutorList, students: studentsRes.data || [] });
    }

    if (!getCached('company_waitlist')) {
      setCache('company_waitlist', { tutors: tutorList });
    }

    if (!getCached('company_dashboard')) {
      preloadDashboard(org, orgId, adminIds, tutorIds, visibleTutors, sessionsRes.data || []);
    }

    if (!getCached('company_stats')) {
      preloadStats(visibleTutors, tutorIds);
    }
  } finally {
    orgPreloadRunning = false;
  }
}

async function preloadDashboard(
  org: any, orgId: string, adminIds: Set<string>,
  tutorIds: string[], tutorProfiles: any[], rawSessions: any[]
) {
  try {
    const tutorMap = new Map(
      tutorProfiles.map((p: any) => [p.id, {
        full_name: p.full_name || 'Tutor',
        payment_timing: p.payment_timing || 'before_lesson',
        payment_deadline_hours: p.payment_deadline_hours ?? 24,
      }])
    );

    const { count: pendingCount } = await supabase
      .from('tutor_invites')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('used', false);

    const monthStart = startOfMonth(new Date()).toISOString();
    const monthEnd = endOfMonth(new Date()).toISOString();
    const now = new Date();
    const next7days = addDays(now, 7);

    const { data: monthSessions } = await supabase
      .from('sessions')
      .select('price, status, payment_status, start_time, end_time')
      .in('tutor_id', tutorIds)
      .gte('start_time', monthStart)
      .lte('start_time', monthEnd)
      .neq('status', 'cancelled')
      .limit(1000);

    const isPaid = (s: any) => s.paid || ['paid', 'confirmed'].includes(s.payment_status);
    const completed = (monthSessions || []).filter((s: any) => s.status === 'completed' || isPaid(s));
    const upcoming = (monthSessions || []).filter(
      (s: any) => s.status === 'active' && isAfter(new Date(s.end_time), now) && isBefore(new Date(s.start_time), next7days)
    );

    setCache('company_dashboard', {
      orgName: org?.name || '', entityType: org?.entity_type || 'company', tutorLimit: org?.tutor_limit || 0,
      activeTutors: tutorIds.length, pendingInvites: pendingCount || 0,
      sessionsThisMonth: completed.length, upcomingSessions: upcoming.length,
      earningsThisMonth: completed.reduce((sum: number, s: any) => sum + (s.price || 0), 0),
      earningsTotal: 0,
      upcomingList: [], attentionList: [], cancelledList: [], recentPayments: [],
    });
  } catch {
    // Non-critical, pages will load their own data
  }
}

async function preloadStats(tutorProfiles: any[], tutorIds: string[]) {
  try {
    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('tutor_id, status, payment_status, price, cancelled_by')
      .in('tutor_id', tutorIds);

    const stats = tutorProfiles.map((tutor: any) => {
      const tutorSessions = (sessionsData || []).filter((s: any) => s.tutor_id === tutor.id);
      const paid = tutorSessions.filter((s: any) =>
        s.status === 'completed' || ['paid', 'confirmed'].includes(s.payment_status)
      );
      const cancelledByTutor = tutorSessions.filter((s: any) => s.status === 'cancelled' && s.cancelled_by === 'tutor');
      const cancelledByStudent = tutorSessions.filter((s: any) => s.status === 'cancelled' && s.cancelled_by === 'student');
      const totalCancelledCount = tutorSessions.filter((s: any) => s.status === 'cancelled').length;
      const earnings = paid.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
      const commPct = (tutor.company_commission_percent ?? 0) / 100;

      return {
        id: tutor.id, full_name: tutor.full_name,
        completedSessions: paid.length,
        cancelledByTutor: cancelledByTutor.length,
        cancelledByStudent: cancelledByStudent.length,
        totalCancelled: totalCancelledCount,
        earnings, companyCommission: earnings * commPct,
        netEarnings: earnings * (1 - commPct),
      };
    });

    const sorted = stats.sort((a: any, b: any) => b.earnings - a.earnings);
    setCache('company_stats', {
      tutorStats: sorted,
      totalEarnings: stats.reduce((s: number, t: any) => s + t.earnings, 0),
      totalCompanyCommission: stats.reduce((s: number, t: any) => s + t.companyCommission, 0),
      totalNetEarnings: stats.reduce((s: number, t: any) => s + t.netEarnings, 0),
      totalSessions: stats.reduce((s: number, t: any) => s + t.completedSessions, 0),
      totalCancelled: stats.reduce((s: number, t: any) => s + t.totalCancelled, 0),
    });
  } catch {
    // Non-critical
  }
}

export async function preloadTutorData() {
  if (tutorPreloadRunning) return;
  if (getCached('tutor_dashboard') && getCached('tutor_students')) return;
  tutorPreloadRunning = true;

  try {
    const user = await getAuthUser();
    if (!user) return;

    const [profileRes, studentsRes, sessionsRes, countRes] = await Promise.all([
      tutorPreloadProfileDeduped(user.id),
      tutorStudentsRowsDeduped(user.id),
      tutorDashboardSessionsDeduped(user.id),
      supabase.from('students')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', user.id),
    ]);

    if (!getCached('tutor_dashboard')) {
      setCache('tutor_dashboard', {
        sessions: sessionsRes.data || [],
        studentCount: countRes.count || 0,
        tutorName: profileRes.data?.full_name || user.email?.split('@')[0] || '',
      });
    }

    if (!getCached('tutor_students')) {
      setCache('tutor_students', { students: studentsRes.data || [] });
    }
  } finally {
    tutorPreloadRunning = false;
  }
}

export async function preloadStudentData() {
  if (studentPreloadRunning) return;
  if (getCached('student_dashboard') && getCached('student_sessions')) return;
  studentPreloadRunning = true;

  try {
    const user = await getAuthUser();
    if (!user) return;

    const ACTIVE_KEY = 'tutlio_active_student_profile_id';
    const selectedId = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null;

    const { data: studentRows } = await rpcGetStudentProfilesDeduped(user.id, selectedId || null);

    const st = studentRows?.[0];
    if (!st) return;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const STUDENT_PRELOAD_SESSION_COLS =
      'id,start_time,end_time,status,paid,price,topic,meeting_link,payment_status,tutor_comment,show_comment_to_student,subject_id';

    const [sessionsRes, waitlistRes] = await Promise.all([
      supabase
        .from('sessions')
        .select(STUDENT_PRELOAD_SESSION_COLS)
        .eq('student_id', st.id)
        .gte('start_time', threeMonthsAgo.toISOString())
        .order('start_time', { ascending: true })
        .limit(400),
      supabase.from('waitlists')
        .select('id, notes, session:sessions(start_time, end_time, topic, price)')
        .eq('student_id', st.id)
        .order('created_at', { ascending: true }),
    ]);

    const sessions = sessionsRes.data || [];
    const waitlist = waitlistRes.data || [];

    if (!getCached('student_dashboard')) {
      setCache('student_dashboard', {
        student: { full_name: st.full_name, grade: st.grade, tutor: null },
        sessions,
      });
    }

    if (!getCached('student_sessions')) {
      setCache('student_sessions', { sessions, waitlist });
    }
  } finally {
    studentPreloadRunning = false;
  }
}
