import { supabase } from '@/lib/supabase';
import { getCached, setCache, dedupeAsync } from '@/lib/dataCache';
import { startOfMonth, endOfMonth, isAfter, isBefore, addDays } from 'date-fns';

function getAuthUser() {
  return dedupeAsync('auth_user', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  });
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

export async function preloadOrgAdminData() {
  if (orgPreloadRunning) return;
  if (getCached('company_tutors') && getCached('company_students') && getCached('company_sessions')) return;
  orgPreloadRunning = true;

  try {
    const user = await getAuthUser();
    if (!user) return;

    const adminRow = await getOrgAdmin(user.id);
    if (!adminRow) return;

    const org = adminRow.organizations as any;
    const orgId = adminRow.organization_id;

    const [{ data: adminUsers }, { data: tutorData }, { data: inviteData }] = await Promise.all([
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
    ]);

    const adminIds = new Set((adminUsers || []).map((a: any) => a.user_id));
    const visibleTutors = (tutorData || []).filter((t: any) => !adminIds.has(t.id));
    const tutorIds = visibleTutors.map((t: any) => t.id);

    if (!getCached('company_tutors')) {
      const enrichedInvites = (inviteData || []).map((inv: any) => ({
        ...inv,
        tutor: (tutorData || []).find((t: any) => t.id === inv.used_by_profile_id) || null,
      }));
      setCache('company_tutors', {
        orgId, tutorLimit: org?.tutor_limit || 0,
        tutors: visibleTutors, invites: enrichedInvites,
      });
    }

    if (tutorIds.length === 0) return;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [studentsRes, sessionsRes] = await Promise.all([
      supabase
        .from('students')
        .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
        .in('tutor_id', tutorIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('*, student:students(full_name), subjects(is_group)')
        .in('tutor_id', tutorIds)
        .gte('start_time', threeMonthsAgo.toISOString())
        .order('start_time', { ascending: false })
        .limit(2000),
    ]);

    const tutorList = visibleTutors.map((t: any) => ({ id: t.id, full_name: t.full_name }));

    if (!getCached('company_students')) {
      setCache('company_students', { students: studentsRes.data || [], tutors: tutorList });
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
      supabase.from('profiles')
        .select('full_name, organization_id, stripe_account_id, payment_timing, payment_deadline_hours')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('students')
        .select('*, linked_user_id')
        .eq('tutor_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('sessions')
        .select('id, student_id, subject_id, start_time, end_time, status, paid, price, topic, created_at, meeting_link, cancellation_reason, payment_status, tutor_comment, show_comment_to_student, is_late_cancelled, cancellation_penalty_amount, penalty_resolution, cancelled_by, subjects(is_trial, name), student:students(full_name, email, phone, payer_email, payer_phone, grade)')
        .eq('tutor_id', user.id)
        .order('start_time', { ascending: true })
        .limit(300),
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

    const { data: studentRows } = await supabase.rpc('get_student_profiles', {
      p_user_id: user.id,
      p_student_id: selectedId || null,
    });

    const st = studentRows?.[0];
    if (!st) return;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [sessionsRes, waitlistRes] = await Promise.all([
      supabase.from('sessions')
        .select('*, subjects(is_group, max_students)')
        .eq('student_id', st.id)
        .gte('start_time', threeMonthsAgo.toISOString())
        .order('start_time', { ascending: true }),
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
