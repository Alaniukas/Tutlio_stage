import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import {
  Users,
  CalendarDays,
  Wallet,
  TrendingUp,
  UserCheck,
  UserX,
  AlertCircle,
  ChevronRight,
  CheckCircle,
  CreditCard,
  X,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isAfter, isBefore, addDays, subDays } from 'date-fns';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import { useTranslation } from '@/lib/i18n';
import { useDismissibleDashboardItemIds } from '@/hooks/useDismissibleDashboardItemIds';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';

interface StatCard {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

type TutorPay = {
  payment_timing: string;
  payment_deadline_hours: number | null;
  full_name: string;
};

interface OrgSessionRow {
  id: string;
  tutor_id: string;
  tutor_name?: string;
  start_time: string;
  end_time: string;
  status: string;
  paid: boolean;
  price: number | null;
  topic: string | null;
  payment_status?: string | null;
  student?: { full_name: string } | null;
}

interface RecentOrgPayment {
  id: string;
  type: 'lesson' | 'package' | 'invoice' | 'school_installment';
  title: string;
  subtitle: string;
  amount: number;
  paidAt: string;
}

const DASH_CACHE_KEY = 'company_dashboard';

export default function CompanyDashboard() {
  const { t, dateFnsLocale } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';
  const openCompanyLessonModal = (sessionId: string) => {
    navigate(`${orgBasePath}/sessions?open=${encodeURIComponent(sessionId)}`);
  };
  const cached = getCached<any>(DASH_CACHE_KEY);
  const [loading, setLoading] = useState(!cached);
  const [orgIdForDismiss, setOrgIdForDismiss] = useState<string | null>(cached?.orgIdForDismiss ?? null);
  const companyAttentionRowsKey = orgIdForDismiss
    ? `tutlio:v1:company_dash_attention_rows:${orgIdForDismiss}`
    : undefined;
  const companyPaymentRowsKey = orgIdForDismiss
    ? `tutlio:v1:company_dash_payment_rows:${orgIdForDismiss}`
    : undefined;
  const {
    dismissedIds: dismissedCompanyAttentionIds,
    dismiss: dismissCompanyAttentionRow,
    restoreAll: restoreAllCompanyAttentionRows,
    ready: companyAttentionRowsReady,
  } = useDismissibleDashboardItemIds(companyAttentionRowsKey);
  const {
    dismissedIds: dismissedCompanyPaymentIds,
    dismiss: dismissCompanyPaymentRow,
    restoreAll: restoreAllCompanyPaymentRows,
    ready: companyPaymentRowsReady,
  } = useDismissibleDashboardItemIds(companyPaymentRowsKey);
  const [orgName, setOrgName] = useState(cached?.orgName ?? '');
  const [tutorLimit, setTutorLimit] = useState(cached?.tutorLimit ?? 0);
  const [activeTutors, setActiveTutors] = useState(cached?.activeTutors ?? 0);
  const [pendingInvites, setPendingInvites] = useState(cached?.pendingInvites ?? 0);
  const [sessionsThisMonth, setSessionsThisMonth] = useState(cached?.sessionsThisMonth ?? 0);
  const [earningsThisMonth, setEarningsThisMonth] = useState(cached?.earningsThisMonth ?? 0);
  const [earningsTotal, setEarningsTotal] = useState(cached?.earningsTotal ?? 0);
  const [upcomingSessions, setUpcomingSessions] = useState(cached?.upcomingSessions ?? 0);

  const [upcomingList, setUpcomingList] = useState<OrgSessionRow[]>(cached?.upcomingList ?? []);
  const [attentionList, setAttentionList] = useState<OrgSessionRow[]>(cached?.attentionList ?? []);
  const [cancelledList, setCancelledList] = useState<OrgSessionRow[]>(cached?.cancelledList ?? []);
  const [recentPayments, setRecentPayments] = useState<RecentOrgPayment[]>(cached?.recentPayments ?? []);
  const [tutorPayMap, setTutorPayMap] = useState<Map<string, TutorPay>>(
    cached?.tutorPayEntries ? new Map(cached.tutorPayEntries) : new Map()
  );

  useEffect(() => {
    // Always refresh in background; cache is only for fast initial paint.
    void loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: adminRow } = await supabase
        .from('organization_admins')
        .select('organization_id, organizations(name, tutor_limit)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!adminRow) {
        setLoading(false);
        return;
      }
      const org = adminRow.organizations as any;
      const organizationId = adminRow.organization_id;
      setOrgIdForDismiss(organizationId);
      setOrgName(org?.name || '');
      setTutorLimit(org?.tutor_limit || 0);

      const visibleTutors = await getOrgVisibleTutors(
        supabase as any,
        organizationId,
        'id, email',
      );
      const tutorIds = visibleTutors.map((tu: any) => tu.id);
      setActiveTutors(tutorIds.length);

      const { count: pendingCount } = await supabase
        .from('tutor_invites')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', adminRow.organization_id)
        .eq('used', false);
      setPendingInvites(pendingCount || 0);

      /** Tutor-scope dashboard blocks; payments list also merges school installments below */
      let tutorRecentMerged: RecentOrgPayment[] = [];
      let cacheSessionsMonth = 0;
      let cacheUpcomingCount = 0;
      let cacheEarningsMonth = 0;
      let cacheEarningsTotal = 0;
      let cacheUpcomingList: OrgSessionRow[] = [];
      let cacheAttentionList: OrgSessionRow[] = [];
      let cacheCancelledList: OrgSessionRow[] = [];
      let cacheTutorPayEntries: [string, TutorPay][] = [];

      if (tutorIds.length === 0) {
        setTutorPayMap(new Map());
        setUpcomingList([]);
        setAttentionList([]);
        setCancelledList([]);
        setSessionsThisMonth(0);
        setUpcomingSessions(0);
        setEarningsThisMonth(0);
        setEarningsTotal(0);
      } else {

      const { data: tutorProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, payment_timing, payment_deadline_hours')
      .in('id', tutorIds);

      const tutorMap = new Map<string, TutorPay>(
      (tutorProfiles || []).map((p: any) => [
        p.id,
        {
          full_name: p.full_name || t('common.tutor'),
          payment_timing: p.payment_timing || 'before_lesson',
          payment_deadline_hours: p.payment_deadline_hours ?? 24,
        },
      ])
    );
      setTutorPayMap(tutorMap);

      const monthStart = startOfMonth(new Date()).toISOString();
      const monthEnd = endOfMonth(new Date()).toISOString();

      const { data: monthSessions } = await supabase
      .from('sessions')
      .select('price, status, payment_status, start_time, end_time')
      .in('tutor_id', tutorIds)
      .gte('start_time', monthStart)
      .lte('start_time', monthEnd)
      .neq('status', 'cancelled')
      .limit(1000);

      const now = new Date();
      const next7days = addDays(now, 7);

      const isPaid = (s: any) => s.paid || ['paid', 'confirmed'].includes(s.payment_status);
      const completed = (monthSessions || []).filter((s) => s.status === 'completed' || isPaid(s));
      const upcoming = (monthSessions || []).filter(
      (s) =>
        s.status === 'active' &&
        isAfter(new Date(s.end_time), now) &&
        isBefore(new Date(s.start_time), next7days)
    );
      setSessionsThisMonth(completed.length);
      setUpcomingSessions(upcoming.length);
      setEarningsThisMonth(completed.reduce((sum, s) => sum + (s.price || 0), 0));

      const { data: allSessions } = await supabase
      .from('sessions')
      .select('price, status, payment_status')
      .in('tutor_id', tutorIds)
      .neq('status', 'cancelled')
      .limit(5000);
      const totalPaid = (allSessions || []).filter(
      (s: any) => s.status === 'completed' || ['paid', 'confirmed'].includes(s.payment_status)
      );
      setEarningsTotal(totalPaid.reduce((sum: number, s: any) => sum + (s.price || 0), 0));

      const { data: sessionsData } = await supabase
      .from('sessions')
      .select('id, tutor_id, student_id, start_time, end_time, status, paid, price, topic, payment_status, student:students(full_name)')
      .in('tutor_id', tutorIds)
      .order('start_time', { ascending: true })
      .limit(800);

      const rows: OrgSessionRow[] = (sessionsData || []).map((r: any) => ({
      ...r,
      tutor_name: tutorMap.get(r.tutor_id)?.full_name || t('common.tutor'),
      student: Array.isArray(r.student) ? r.student[0] ?? null : r.student ?? null,
    }));
      const past30 = subDays(now, 30);
      const nowMs = now.getTime();
      const attentionWindowMs = 6 * 3600000;

      const upcomingFiltered = rows
      .filter(
        (s) =>
          s.status === 'active' &&
          s.paid &&
          isAfter(new Date(s.end_time), now) &&
          isBefore(new Date(s.start_time), next7days)
      )
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 5);

      const attentionFiltered = rows
      .filter((s) => {
        if (s.paid || s.status === 'cancelled') return false;
        const tp = tutorMap.get(s.tutor_id);
        if (!tp) return false;
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const deadlineBaseHours = tp.payment_deadline_hours ?? 24;
        const deadline =
          tp.payment_timing === 'before_lesson'
            ? new Date(start.getTime() - deadlineBaseHours * 3600000)
            : new Date(end.getTime() + deadlineBaseHours * 3600000);
        const deadlineMs = deadline.getTime();
        const isOverdue = deadlineMs <= nowMs;
        const isSoon = deadlineMs > nowMs && deadlineMs - nowMs <= attentionWindowMs;
        const isRecent = isAfter(start, past30);
        const pendingConfirm = s.payment_status === 'paid_by_student';
        return isRecent && (isOverdue || isSoon || pendingConfirm);
      })
      .sort((a, b) => {
        if (a.payment_status === 'paid_by_student' && b.payment_status !== 'paid_by_student') return -1;
        if (b.payment_status === 'paid_by_student' && a.payment_status !== 'paid_by_student') return 1;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      })
      .slice(0, 8);

      const cancelledFiltered = rows
      .filter((s) => s.status === 'cancelled' && s.paid)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      .slice(0, 5);

      setUpcomingList(upcomingFiltered);
      setAttentionList(attentionFiltered);
      setCancelledList(cancelledFiltered);
      cacheSessionsMonth = completed.length;
      cacheUpcomingCount = upcoming.length;
      cacheEarningsMonth = completed.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
      cacheEarningsTotal = totalPaid.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
      cacheUpcomingList = upcomingFiltered;
      cacheAttentionList = attentionFiltered;
      cacheCancelledList = cancelledFiltered;
      cacheTutorPayEntries = Array.from(tutorMap.entries());

      const [paidLessonsRes, paidPackagesRes, paidInvoicesRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, start_time, price, topic, tutor_id, subject_id, student:students(full_name), subjects(name, is_trial)')
        .in('tutor_id', tutorIds)
        .eq('paid', true)
        .is('lesson_package_id', null)
        .is('payment_batch_id', null)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: false })
        .limit(20),
      supabase
        .from('lesson_packages')
        .select('id, paid_at, price_per_lesson, total_price, total_lessons, tutor_id, student_id, subject_id')
        .in('tutor_id', tutorIds)
        .eq('paid', true)
        .not('paid_at', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(20),
      supabase
        .from('billing_batches')
        .select('id, paid_at, total_amount, period_start_date, period_end_date, payer_name, tutor_id')
        .in('tutor_id', tutorIds)
        .eq('paid', true)
        .not('paid_at', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(20),
    ]);

      const packageStudentIds = [...new Set((paidPackagesRes.data || []).map((p: any) => p.student_id).filter(Boolean))];
      const packageSubjectIds = [...new Set((paidPackagesRes.data || []).map((p: any) => p.subject_id).filter(Boolean))];
      const [packageStudentsRes, packageSubjectsRes] = await Promise.all([
      packageStudentIds.length
        ? supabase.from('students').select('id, full_name').in('id', packageStudentIds)
        : Promise.resolve({ data: [] as any[] } as any),
      packageSubjectIds.length
        ? supabase.from('subjects').select('id, name, is_trial').in('id', packageSubjectIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);
      const packageStudentMap = new Map<string, string>((packageStudentsRes.data || []).map((s: any) => [s.id, s.full_name || t('common.student')]));
      const packageSubjectMap = new Map<string, { name: string; is_trial: boolean }>(
      (packageSubjectsRes.data || []).map((s: any) => [s.id, { name: s.name || t('common.lesson'), is_trial: s.is_trial === true }])
    );

      const lessonPayments: RecentOrgPayment[] = (paidLessonsRes.data || []).map((s: any) => ({
      id: `lesson_${s.id}`,
      type: 'lesson',
      title: `${s.student?.full_name || t('common.student')} · ${tutorMap.get(s.tutor_id)?.full_name || ''}`.trim(),
      subtitle: `${format(new Date(s.start_time), 'd MMM', { locale: dateFnsLocale })}${s.subjects?.is_trial ? ` · ${t('common.lesson')}` : ''}${s.topic ? ` · ${s.topic}` : ''}`,
      amount: Number(s.price || 0),
      paidAt: s.start_time,
    }));

      const packagePayments: RecentOrgPayment[] = (paidPackagesRes.data || []).map((p: any) => {
      const subj = packageSubjectMap.get(p.subject_id);
      const payoutAmount = Number(p.price_per_lesson || 0) > 0 && Number(p.total_lessons || 0) > 0
        ? Number(p.price_per_lesson) * Number(p.total_lessons)
        : Number(p.total_price || 0);
      return {
        id: `package_${p.id}`,
        type: 'package',
        title: `${packageStudentMap.get(p.student_id) || t('common.student')} · ${tutorMap.get(p.tutor_id)?.full_name || ''}`.trim(),
        subtitle: `${subj?.is_trial ? t('common.lesson') : `${p.total_lessons || 0} ${t('common.lessons').toLowerCase().slice(0, 4)}.`} · ${subj?.name || t('common.lesson')}`,
        amount: payoutAmount,
        paidAt: p.paid_at,
      };
    });

      const invoicePayments: RecentOrgPayment[] = (paidInvoicesRes.data || []).map((b: any) => ({
      id: `invoice_${b.id}`,
      type: 'invoice',
      title: b.payer_name || t('common.student'),
      subtitle: `${t('invoice.invoiceTitle') || 'Invoice'} · ${b.period_start_date} – ${b.period_end_date}`,
      amount: Number(b.total_amount || 0),
      paidAt: b.paid_at,
    }));

      tutorRecentMerged = [...lessonPayments, ...packagePayments, ...invoicePayments]
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .slice(0, 5);
      } /* tutorIds.length > 0 */

      const { data: schoolPaidRows, error: schoolPaidErr } = await supabase
        .from('school_payment_installments')
        .select(
          `
          id,
          amount,
          paid_at,
          installment_number,
          contract:school_contracts(organization_id, student:students(full_name))
        `,
        )
        .eq('payment_status', 'paid')
        .not('paid_at', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(30);
      if (schoolPaidErr) console.error('[CompanyDashboard] school installments:', schoolPaidErr);

      const schoolInstPayments: RecentOrgPayment[] = (schoolPaidRows || [])
        .map((row: any) => {
          const contract = Array.isArray(row.contract) ? row.contract[0] : row.contract;
          if (contract?.organization_id !== organizationId) return null;
          const student = contract?.student;
          const studentOne = Array.isArray(student) ? student[0] : student;
          return {
            id: `school_installment_${row.id}`,
            type: 'school_installment' as const,
            title: `${studentOne?.full_name || t('common.student')}`,
            subtitle: `${t('companyDash.recentSchoolInstallment')} · ${t('school.installments')} #${row.installment_number}`,
            amount: Number(row.amount || 0),
            paidAt: row.paid_at as string,
          };
        })
        .filter(Boolean) as RecentOrgPayment[];

      const finalRecentMerged = [...tutorRecentMerged, ...schoolInstPayments]
        .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
        .slice(0, 5);
      setRecentPayments(finalRecentMerged);

      setCache(DASH_CACHE_KEY, {
        orgIdForDismiss: organizationId,
        orgName: org?.name || '',
        tutorLimit: org?.tutor_limit || 0,
        activeTutors: tutorIds.length,
        pendingInvites: pendingCount || 0,
        sessionsThisMonth: cacheSessionsMonth,
        upcomingSessions: cacheUpcomingCount,
        earningsThisMonth: cacheEarningsMonth,
        earningsTotal: cacheEarningsTotal,
        upcomingList: cacheUpcomingList,
        attentionList: cacheAttentionList,
        cancelledList: cacheCancelledList,
        recentPayments: finalRecentMerged,
        tutorPayEntries: cacheTutorPayEntries,
      });
    } finally {
      setLoading(false);
    }
  };

  const stats: StatCard[] = [
    {
      label: t('companyDash.tutors'),
      value: `${activeTutors} / ${tutorLimit}`,
      sub: `${tutorLimit - activeTutors} ${t('companyDash.freeInvites')}`,
      icon: <Users className="w-5 h-5" />,
      iconBg: 'bg-slate-900',
      iconColor: 'text-indigo-200',
    },
    {
      label: t('companyDash.lessonsThisMonth'),
      value: sessionsThisMonth,
      sub: `${upcomingSessions} ${t('companyDash.planned')}`,
      icon: <CalendarDays className="w-5 h-5" />,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      label: t('companyDash.earningsThisMonth'),
      value: `${earningsThisMonth.toFixed(2)} €`,
      sub: format(new Date(), 'MMMM yyyy', { locale: dateFnsLocale }),
      icon: <Wallet className="w-5 h-5" />,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    {
      label: t('companyDash.totalEarnings'),
      value: `${earningsTotal.toFixed(2)} €`,
      sub: t('companyDash.sinceStart'),
      icon: <TrendingUp className="w-5 h-5" />,
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
    },
  ];

  const visibleCompanyAttention = attentionList.filter((s) => !dismissedCompanyAttentionIds.has(s.id));
  const visibleCompanyPayments = recentPayments.filter((p) => !dismissedCompanyPaymentIds.has(p.id));

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sveiki, {orgName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(), 'cccc, d MMMM yyyy', { locale: dateFnsLocale })}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className={`w-10 h-10 rounded-xl ${s.iconBg} ${s.iconColor} flex items-center justify-center mb-3`}>
                {s.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs font-medium text-gray-500 mt-0.5">{s.label}</p>
              {s.sub && <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>}
            </div>
          ))}
        </div>

        {activeTutors > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-gray-900">{t('companyDash.upcomingLessons')}</h2>
                </div>
                <Link to={`${orgBasePath}/sessions`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                  {t('companyDash.allLabel')} <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {upcomingList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('companyDash.noUpcoming')}</p>
              ) : (
                <div className="space-y-2">
                  {upcomingList.map((s) => (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCompanyLessonModal(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openCompanyLessonModal(s.id);
                        }
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-transparent cursor-pointer hover:bg-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="w-1 h-10 rounded-full bg-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {s.student?.full_name || t('common.student')}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {format(new Date(s.start_time), 'EEE d MMM, HH:mm', { locale: dateFnsLocale })}
                          {s.topic ? ` · ${s.topic}` : ''}
                        </p>
                        <p className="text-xs text-indigo-600 mt-0.5">
                          {t('companyDash.tutor')}: {s.tutor_name || '—'}
                        </p>
                      </div>
                      {s.price != null && (
                        <span className="text-sm font-semibold text-gray-700 flex-shrink-0">€{s.price}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <h2 className="text-lg font-bold text-gray-900">{t('companyDash.needsAttention')}</h2>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-1 rounded-md">
                    {companyAttentionRowsReady ? visibleCompanyAttention.length : attentionList.length}{' '}
                    {t('companyDash.entries')}
                  </span>
                </div>
              </div>
              {attentionList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('companyDash.noAttention')}</p>
              ) : companyAttentionRowsReady && visibleCompanyAttention.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-gray-500">{t('dash.allRowsHiddenHint')}</p>
                  {companyAttentionRowsKey && (
                    <button
                      type="button"
                      onClick={restoreAllCompanyAttentionRows}
                      className="text-sm text-indigo-600 hover:underline font-medium"
                    >
                      {t('dash.restoreHiddenRows')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleCompanyAttention.map((s) => {
                    const tp = tutorPayMap.get(s.tutor_id);
                    const start = new Date(s.start_time);
                    const end = new Date(s.end_time);
                    const isPendingConfirm = s.payment_status === 'paid_by_student';
                    const deadlineBaseHours = tp?.payment_deadline_hours ?? 24;
                    const deadline =
                      tp?.payment_timing === 'before_lesson'
                        ? new Date(start.getTime() - deadlineBaseHours * 3600000)
                        : new Date(end.getTime() + deadlineBaseHours * 3600000);
                    const diffMs = deadline.getTime() - Date.now();
                    const remainingHours = Math.max(0, Math.floor(diffMs / 3600000));

                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-1 p-3 rounded-xl border border-amber-100 bg-amber-50/50 hover:shadow-md hover:border-amber-200 transition-all group"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openCompanyLessonModal(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openCompanyLessonModal(s.id);
                            }
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                              isPendingConfirm ? 'bg-amber-100 group-hover:bg-amber-200' : 'bg-red-50 group-hover:bg-red-100'
                            }`}
                          >
                            {isPendingConfirm ? (
                              <CreditCard className="w-5 h-5 text-amber-600" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {s.student?.full_name || t('common.student')}
                              </p>
                              <div className="scale-90 origin-right">
                                <StatusBadge
                                  status={s.status}
                                  paymentStatus={s.payment_status}
                                  paid={s.paid}
                                  endTime={s.end_time}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {format(start, 'd MMM yyyy, HH:mm', { locale: dateFnsLocale })}
                              {s.topic ? ` · ${s.topic}` : ''}
                            </p>
                            <p className="text-[11px] mt-1 font-medium px-1.5 py-0.5 rounded-md inline-block">
                              {isPendingConfirm ? (
                                <span className="text-amber-700 bg-amber-50">{t('dash.reasonPendingConfirm')}</span>
                              ) : diffMs <= 0 ? (
                                <span className="text-red-600 bg-red-50">{t('dash.deadlinePassed')}</span>
                              ) : (
                                <span className="text-orange-600 bg-orange-50">
                                  {t('dash.hoursLeft').replace('{n}', String(remainingHours))}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        {companyAttentionRowsKey && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissCompanyAttentionRow(s.id);
                            }}
                            className="p-1.5 h-fit rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/80 flex-shrink-0 self-center"
                            aria-label={t('dash.dismissRow')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {companyAttentionRowsReady &&
                    companyAttentionRowsKey &&
                    dismissedCompanyAttentionIds.size > 0 &&
                    visibleCompanyAttention.length > 0 && (
                      <button
                        type="button"
                        onClick={restoreAllCompanyAttentionRows}
                        className="w-full text-center text-xs text-indigo-600 hover:underline font-medium pt-1"
                      >
                        {t('dash.restoreHiddenRows')}
                      </button>
                    )}
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTutors > 0 || recentPayments.length > 0) && (
          <div className={`grid gap-6 ${activeTutors > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-lg font-bold text-gray-900">{t('companyDash.recentPayments')}</h2>
                </div>
                <Link
                  to={orgBasePath === '/school' ? `${orgBasePath}/finance?tab=payments` : `${orgBasePath}/finance`}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                >
                  {t('common.finance')} <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {recentPayments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('companyDash.noPayments')}</p>
              ) : companyPaymentRowsReady && visibleCompanyPayments.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-gray-500">{t('dash.allRowsHiddenHint')}</p>
                  {companyPaymentRowsKey && (
                    <button
                      type="button"
                      onClick={restoreAllCompanyPaymentRows}
                      className="text-sm text-indigo-600 hover:underline font-medium"
                    >
                      {t('dash.restoreHiddenRows')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleCompanyPayments.map((p) => (
                    <div key={p.id} className="flex items-center gap-1 p-3 rounded-xl bg-gray-50">
                      <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.subtitle}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-gray-900">€{p.amount.toFixed(2)}</p>
                          <p className="text-xs text-gray-400">
                            {format(new Date(p.paidAt), 'd MMM', { locale: dateFnsLocale })}
                          </p>
                        </div>
                      </div>
                      {companyPaymentRowsKey && (
                        <button
                          type="button"
                          onClick={() => dismissCompanyPaymentRow(p.id)}
                          className="p-1.5 h-fit rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white flex-shrink-0 self-center"
                          aria-label={t('dash.dismissRow')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {companyPaymentRowsReady &&
                    companyPaymentRowsKey &&
                    dismissedCompanyPaymentIds.size > 0 &&
                    visibleCompanyPayments.length > 0 && (
                      <button
                        type="button"
                        onClick={restoreAllCompanyPaymentRows}
                        className="w-full text-center text-xs text-indigo-600 hover:underline font-medium"
                      >
                        {t('dash.restoreHiddenRows')}
                      </button>
                    )}
                </div>
              )}
            </div>

            {activeTutors > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-red-400" />
                    <h2 className="text-lg font-bold text-gray-900">{t('companyDash.cancelledPaid')}</h2>
                  </div>
                  <Link to={`${orgBasePath}/sessions`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    {t('companyDash.allLabel')} <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {cancelledList.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">{t('companyDash.noCancelledPaid')}</p>
                ) : (
                  <div className="space-y-2">
                    {cancelledList.map((s) => (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openCompanyLessonModal(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openCompanyLessonModal(s.id);
                          }
                        }}
                        className="p-3 rounded-xl border border-red-100 bg-red-50/40 cursor-pointer hover:bg-red-50/70 transition-colors"
                      >
                        <p className="text-sm font-semibold text-gray-900">{s.student?.full_name || t('common.student')}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {format(new Date(s.start_time), 'EEE d MMM yyyy, HH:mm', { locale: dateFnsLocale })}
                          {s.topic ? ` · ${s.topic}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to={`${orgBasePath}/tutors`}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-indigo-200 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200 transition-colors">
              <UserCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{t('companyDash.tutorManagement')}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {pendingInvites > 0 ? `${pendingInvites} ${t('companyDash.pendingInvite')}` : t('companyDash.createInvite')}
              </p>
            </div>
          </Link>

          <Link
            to={`${orgBasePath}/stats`}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-violet-200 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-200 transition-colors">
              <TrendingUp className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{t('companyDash.statistics')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('companyDash.statsDesc')}</p>
            </div>
          </Link>

          <Link
            to={`${orgBasePath}/sessions`}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
              <CalendarDays className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{t('companyDash.allLessons')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('companyDash.allLessonsDesc')}</p>
            </div>
          </Link>

          <Link
            to={`${orgBasePath}/tutors`}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-red-200 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors">
              <UserX className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{t('companyDash.pendingInvites')}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {pendingInvites > 0 ? `${pendingInvites}` : t('companyDash.allUsed')}
              </p>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
