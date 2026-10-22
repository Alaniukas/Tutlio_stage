import { useEffect, useRef, useState } from 'react';
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
  Mail,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import MarkStudentNoShowDialog from '@/components/MarkStudentNoShowDialog';
import { useTranslation } from '@/lib/i18n';
import { useDismissibleDashboardItemIds } from '@/hooks/useDismissibleDashboardItemIds';
import { isProKlaseOrg } from '@/lib/marketMoney';
import { authHeaders } from '@/lib/apiHelpers';
import { deriveAttendance } from '@/lib/attendance';
import { buildNoShowSessionPatch, defaultNoShowWhenForNow } from '@/lib/noShowWhen';
import { useMarketMoney } from '@/hooks/useMarketMoney';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import { confirmSessionOutcome } from '@/lib/confirmSessionOutcome';
import { useStudentRegistrationStatus } from '@/hooks/useStudentRegistrationStatus';
import StudentRegistrationAlert from '@/components/StudentRegistrationAlert';
import { withRequestDeadline } from '@/lib/requestDeadline';
import { loadDashboardOverview, loadDashboardAttention, loadDashboardPayments, type DashboardSnapshot, type TutorPay, type OrgSessionRow, type OrgAttentionRow, type RecentOrgPayment, type OverduePackage } from '@/lib/companyDashboardData';

interface StatCard {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

const DASH_CACHE_KEY = 'company_dashboard';
const TUTOR_OUTCOME_REMINDER_COOLDOWN_MS = 60 * 60 * 1000;

function attendanceAttentionSummary(
  session: Pick<OrgSessionRow, 'start_time' | 'end_time' | 'status' | 'tutor_joined_at' | 'student_joined_at' | 'status_confirmed_at' | 'meeting_link'>,
  t: (key: string, params?: Record<string, string>) => string,
  proKlaseOutcomePending = false,
): string {
  const info = deriveAttendance(session);
  if (proKlaseOutcomePending && !session.status_confirmed_at) {
    const endMs = session.end_time ? Date.parse(String(session.end_time)) : NaN;
    if (Number.isFinite(endMs) && endMs <= Date.now()) {
      return t('companyDash.tutorOutcomeNotMarked');
    }
  }
  const time = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }) : '';
  const issues: string[] = [];
  if (info.tutor === 'missing') issues.push(t('att.tutorMissing'));
  else if (info.tutor === 'late') issues.push(t('att.tutorLate', { time: time(session.tutor_joined_at) }));
  if (info.student === 'missing') issues.push(t('att.studentMissing'));
  else if (info.student === 'late') issues.push(t('att.studentLate', { time: time(session.student_joined_at) }));
  if (issues.length === 0) return t('companyDash.attendanceAttentionHint');
  return issues.join(' · ');
}

export default function CompanyDashboard() {
  const { t, dateFnsLocale } = useTranslation();
  const { fmt } = useMarketMoney();
  const { can, membership } = useOrgAdminAccess();
  const showFinanceTotals = can('finance.totals');
  const location = useLocation();
  const navigate = useNavigate();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';
  const staffLabel = orgBasePath === '/school' ? t('role.staffSchool') : t('companyDash.tutor');
  const openCompanyLessonModal = (sessionId: string) => {
    navigate(`${orgBasePath}/sessions?open=${encodeURIComponent(sessionId)}`);
  };
  const candidate = getCached<DashboardSnapshot>(DASH_CACHE_KEY);
  const cached = candidate?.complete === true && candidate.organizationId === membership?.organizationId
    && candidate.financeTotalsAccess === showFinanceTotals ? candidate : null;
  const loadId = useRef(0);
  const [hasLoaded, setHasLoaded] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState(false);
  const [attentionLoading, setAttentionLoading] = useState(!cached);
  const [paymentsLoading, setPaymentsLoading] = useState(!cached);
  const [attentionError, setAttentionError] = useState(false);
  const [paymentsError, setPaymentsError] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [orgIdForDismiss, setOrgIdForDismiss] = useState<string | null>(cached?.orgIdForDismiss ?? null);
  const registration = useStudentRegistrationStatus(can('students.view') ? orgIdForDismiss : null);
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
  const [tutorLicenseCap, setTutorLicenseCap] = useState<number>(cached?.tutorLicenseCap ?? 0);
  const [licensedTutors, setLicensedTutors] = useState<number>(cached?.licensedTutors ?? 0);
  const [activeTutors, setActiveTutors] = useState(cached?.activeTutors ?? 0);
  const [pendingInvites, setPendingInvites] = useState(cached?.pendingInvites ?? 0);
  const [sessionsThisMonth, setSessionsThisMonth] = useState(cached?.sessionsThisMonth ?? 0);
  const [earningsThisMonth, setEarningsThisMonth] = useState(cached?.earningsThisMonth ?? 0);
  const [earningsTotal, setEarningsTotal] = useState(cached?.earningsTotal ?? 0);
  const [upcomingSessions, setUpcomingSessions] = useState(cached?.upcomingSessions ?? 0);

  const [upcomingList, setUpcomingList] = useState<OrgSessionRow[]>(cached?.upcomingList ?? []);
  const [attentionList, setAttentionList] = useState<OrgAttentionRow[]>(cached?.attentionList ?? []);
  const [noShowTarget, setNoShowTarget] = useState<OrgAttentionRow | null>(null);
  const [markingNoShow, setMarkingNoShow] = useState(false);
  const [remindingTutorSessionId, setRemindingTutorSessionId] = useState<string | null>(null);
  const [overduePackages, setOverduePackages] = useState<OverduePackage[]>(cached?.overduePackages ?? []);
  const [resendingOverduePackageId, setResendingOverduePackageId] = useState<string | null>(null);
  const [cancelledList, setCancelledList] = useState<OrgSessionRow[]>(cached?.cancelledList ?? []);
  const [recentPayments, setRecentPayments] = useState<RecentOrgPayment[]>(cached?.recentPayments ?? []);
  const [tutorPayMap, setTutorPayMap] = useState<Map<string, TutorPay>>(
    cached?.tutorPayEntries ? new Map(cached.tutorPayEntries) : new Map()
  );

  useEffect(() => {
    void loadData();
    return () => { loadId.current += 1; };
  }, [membership?.organizationId, showFinanceTotals, dateFnsLocale]);

  const loadData = async () => {
    const id = ++loadId.current;
    const current = () => loadId.current === id;
    if (!hasLoaded) setLoading(true);
    setLoadError(false);
    try {
      if (!membership?.organizationId) throw new Error('dashboard_membership_missing');
      const context = await withRequestDeadline(signal => loadDashboardOverview(
        membership.organizationId, membership.organization, t, dateFnsLocale, signal,
      ));
      if (!current()) return;
      const overview = context.overview;
      setOrgIdForDismiss(overview.organizationId);
      setOrgName(overview.orgName);
      setTutorLicenseCap(overview.tutorLicenseCap);
      setLicensedTutors(overview.licensedTutors);
      setActiveTutors(overview.activeTutors);
      setPendingInvites(overview.pendingInvites);
      setSessionsThisMonth(overview.sessionsThisMonth);
      setUpcomingSessions(overview.upcomingSessions);
      setEarningsThisMonth(overview.earningsThisMonth);
      setEarningsTotal(overview.earningsTotal);
      setUpcomingList(overview.upcomingList);
      setCancelledList(overview.cancelledList);
      setTutorPayMap(context.tutorMap);
      setHasLoaded(true);
      setLoading(false);
      setAttentionLoading(true);
      setPaymentsLoading(showFinanceTotals);
      setAttentionError(false);
      setPaymentsError(false);

      // These independent sections cannot hold the entire overview spinner.
      const [attention, payments] = await Promise.all([
        withRequestDeadline(signal => loadDashboardAttention(context, showFinanceTotals, signal))
          .then(result => {
            if (current()) { setAttentionList(result.attentionList); setOverduePackages(result.overduePackages); }
            return result;
          }).catch(error => {
            if (current()) { console.error('[CompanyDashboard] attention:', error); setAttentionError(true); }
            return null;
          }).finally(() => { if (current()) setAttentionLoading(false); }),
        withRequestDeadline(signal => loadDashboardPayments(context, showFinanceTotals, signal))
          .then(result => { if (current()) setRecentPayments(result); return result; })
          .catch(error => {
            if (current()) { console.error('[CompanyDashboard] payments:', error); setPaymentsError(true); }
            return null;
          }).finally(() => { if (current()) setPaymentsLoading(false); }),
      ]);
      if (current() && attention && payments) {
        setCache<DashboardSnapshot>(DASH_CACHE_KEY, {
          ...overview, ...attention, recentPayments: payments, complete: true, financeTotalsAccess: showFinanceTotals,
        });
      }
    } catch (error) {
      if (current()) {
        console.error('[CompanyDashboard] overview:', error);
        setLoadError(true);
        setAttentionError(value => value || attentionLoading);
        setPaymentsError(value => value || paymentsLoading);
        setAttentionLoading(false);
        setPaymentsLoading(false);
      }
    } finally {
      if (current()) setLoading(false);
    }
  };

  const stats: StatCard[] = [
    {
      label: t('companyDash.tutors'),
      value: t('companyDash.tutorStatValue', { count: String(activeTutors) }),
      sub:
        tutorLicenseCap > 0
          ? t('companyDash.tutorStatSubLicenses', {
              used: String(licensedTutors),
              total: String(tutorLicenseCap),
              pending: String(pendingInvites),
            })
          : t('companyDash.tutorStatSubInvites', { pending: String(pendingInvites) }),
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
    ...(showFinanceTotals
      ? [
          {
            label: t('companyDash.earningsThisMonth'),
            value: fmt(earningsThisMonth),
            sub: format(new Date(), 'MMMM yyyy', { locale: dateFnsLocale }),
            icon: <Wallet className="w-5 h-5" />,
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
          },
          {
            label: t('companyDash.totalEarnings'),
            value: fmt(earningsTotal),
            sub: t('companyDash.sinceStart'),
            icon: <TrendingUp className="w-5 h-5" />,
            iconBg: 'bg-violet-100',
            iconColor: 'text-violet-600',
          },
        ]
      : [
          {
            label: t('companyDash.needsAttention'),
            value: attentionLoading ? t('common.loading') : attentionList.length + overduePackages.length,
            sub: t('companyDash.entries'),
            icon: <AlertCircle className="w-5 h-5" />,
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
          },
          {
            label: t('companyDash.paymentFollowups'),
            value: attentionLoading ? t('common.loading') : attentionList.filter((s) => s.reasons.includes('payment')).length + overduePackages.length,
            sub: t('companyDash.entries'),
            icon: <CreditCard className="w-5 h-5" />,
            iconBg: 'bg-emerald-100',
            iconColor: 'text-emerald-600',
          },
        ]),
  ];

  const visibleCompanyAttention = attentionList.filter((s) => !dismissedCompanyAttentionIds.has(s.id));
  const visibleCompanyPayments = recentPayments.filter((p) => !dismissedCompanyPaymentIds.has(p.id));
  const isProKlaseAdmin = isProKlaseOrg(orgIdForDismiss);

  const handleConfirmNoShow = async () => {
    if (!noShowTarget) return;
    const sessionId = noShowTarget.id;
    setMarkingNoShow(true);
    try {
      if (isProKlaseAdmin) {
        await confirmSessionOutcome({
          sessionId,
          currentStatus: noShowTarget.status,
          status: 'no_show',
          startTime: noShowTarget.start_time,
          endTime: noShowTarget.end_time,
        });
      } else {
        const when = defaultNoShowWhenForNow(
          new Date(noShowTarget.start_time),
          new Date(noShowTarget.end_time),
        );
        const patch = buildNoShowSessionPatch(when, noShowTarget.tutor_comment);
        const { error } = await supabase.from('sessions').update(patch).eq('id', sessionId);
        if (error) throw error;
      }
      setNoShowTarget(null);
      void loadData();
      void (async () => {
        await fetch('/api/notify-session-no-show', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ sessionId }),
        });
      })().catch(() => {});
    } catch (error) {
      alert(t('cal.confirmStatusError', { msg: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMarkingNoShow(false);
    }
  };

  const handleConfirmAttended = async (session: OrgAttentionRow) => {
    if (!isProKlaseAdmin) return;
    setMarkingNoShow(true);
    try {
      await confirmSessionOutcome({
        sessionId: session.id,
        currentStatus: session.status,
        status: 'completed',
        startTime: session.start_time,
        endTime: session.end_time,
      });
      void loadData();
    } catch (error) {
      alert(t('cal.confirmStatusError', { msg: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMarkingNoShow(false);
    }
  };

  const handleResendOverduePackage = async (packageId: string) => {
    setResendingOverduePackageId(packageId);
    try {
      const resp = await fetch('/api/resend-package-email', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ packageId }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((result as { error?: string }).error || String(resp.status));
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setResendingOverduePackageId(null);
    }
  };

  const handleSendTutorOutcomeReminder = async (session: OrgAttentionRow) => {
    if (!isProKlaseAdmin) return;
    setRemindingTutorSessionId(session.id);
    try {
      const response = await fetch('/api/remind-tutor-session-status', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId: session.id }),
      });
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      if (response.status === 429) {
        alert(t('companyDash.tutorOutcomeReminderTooSoon'));
        return;
      }
      if (!response.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : response.statusText);
      }
      alert(t('companyDash.tutorOutcomeReminderSent'));
      void loadData();
    } catch (error) {
      alert(t('companyDash.tutorOutcomeReminderFailed', {
        msg: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setRemindingTutorSessionId(null);
    }
  };

  if (loading) {
    return (
      <>
        <div role="status" aria-label={t('common.loading')} aria-busy="true" className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const retryNotice = (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p>{t('companyDash.loadFailed')}</p>
      <button type="button" onClick={() => void loadData()} className="mt-2 font-semibold underline">{t('stuSess.retryLoad')}</button>
    </div>
  );
  if (!hasLoaded) return retryNotice;

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
        {loadError && retryNotice}
        {registration.enabled && <StudentRegistrationAlert states={registration.states} error={registration.error} showLink />}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sveiki, {orgName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(), 'cccc, d MMMM yyyy', { locale: dateFnsLocale })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 sm:p-4">
              <div className={`w-10 h-10 rounded-xl ${s.iconBg} ${s.iconColor} flex items-center justify-center mb-3`}>
                {s.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="mt-0.5 text-xs font-medium leading-snug text-gray-500">{s.label}</p>
              {s.sub && <p className="mt-0.5 text-xs leading-snug text-gray-400">{s.sub}</p>}
            </div>
          ))}
        </div>

        {activeTutors > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div role="region" aria-label={t('companyDash.upcomingLessons')} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <CalendarDays className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">{t('companyDash.upcomingLessons')}</h2>
                </div>
                <Link to={`${orgBasePath}/sessions`} className="flex min-h-[44px] shrink-0 touch-manipulation items-center gap-1 text-right text-xs text-indigo-600 hover:underline">
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
                          {staffLabel}: {s.tutor_name || '—'}
                        </p>
                      </div>
                      {showFinanceTotals && s.price != null && (
                        <span className="text-sm font-semibold text-gray-700 flex-shrink-0">{fmt(s.price)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div role="region" aria-label={t('companyDash.needsAttention')} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <h2 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">{t('companyDash.needsAttention')}</h2>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-1 rounded-md">
                    {attentionLoading ? t('common.loading') : <>{(companyAttentionRowsReady ? visibleCompanyAttention.length : attentionList.length) + overduePackages.length}{' '}{t('companyDash.entries')}</>}
                  </span>
                </div>
              </div>
              {attentionError && retryNotice}
              {attentionLoading && attentionList.length === 0 && overduePackages.length === 0 ? (
                <p role="status" className="text-sm text-gray-500 text-center py-8">{t('common.loading')}</p>
              ) : attentionError && attentionList.length === 0 && overduePackages.length === 0 ? null : attentionList.length === 0 && overduePackages.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('companyDash.noAttention')}</p>
              ) : companyAttentionRowsReady && visibleCompanyAttention.length === 0 && overduePackages.length === 0 ? (
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
                  {overduePackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="relative rounded-xl border border-red-100/80 bg-red-50/30 p-3 pl-5"
                    >
                      <div className="absolute bottom-3 left-2 top-3 w-1 rounded-full bg-red-500" />
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 py-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {pkg.studentName || t('common.student')}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                            {pkg.billingPeriodStart?.slice(0, 7) || '—'}
                            {' · '}
                            <span className="font-medium text-red-700">{t('package.overdueUnpaid')}</span>
                            {' · '}
                            {fmt(pkg.totalPrice)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={resendingOverduePackageId === pkg.id}
                          onClick={() => void handleResendOverduePackage(pkg.id)}
                          className="flex min-h-[44px] flex-shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {resendingOverduePackageId === pkg.id
                            ? t('companyDash.packageReminderSending')
                            : t('companyDash.sendPackageReminder')}
                        </button>
                      </div>
                    </div>
                  ))}
                  {visibleCompanyAttention.map((s) => {
                    const tp = tutorPayMap.get(s.tutor_id);
                    const start = new Date(s.start_time);
                    const end = new Date(s.end_time);
                    const hasPaymentReason = s.reasons.includes('payment');
                    const hasAttendanceReason = s.reasons.includes('attendance');
                    const hasTrialNoPackageReason = s.reasons.includes('trial_no_package');
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
                        className="relative rounded-xl border border-amber-100/80 bg-amber-50/40 p-3 pl-5 transition-colors hover:border-amber-200/80 hover:bg-amber-50/70"
                      >
                        <div
                          className={`absolute bottom-3 left-2 top-3 w-1 rounded-full ${
                            hasAttendanceReason
                              ? (isProKlaseAdmin ? 'bg-amber-400' : 'bg-rose-400')
                              : hasTrialNoPackageReason
                                ? 'bg-red-500'
                                : isPendingConfirm
                                  ? 'bg-amber-400'
                                : 'bg-red-400'
                          }`}
                        />
                        <div className="flex items-start gap-2">
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
                            className="min-w-0 flex-1 cursor-pointer py-1"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {s.student?.full_name || t('common.student')}
                              </p>
                              {hasPaymentReason && !hasAttendanceReason && (
                                <div className="origin-left scale-[0.85] shrink-0">
                                  <StatusBadge
                                    status={s.status}
                                    paymentStatus={s.payment_status}
                                    paid={s.paid}
                                    endTime={s.end_time}
                                  />
                                </div>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-gray-500 sm:truncate">
                              {format(start, 'd MMM, HH:mm', { locale: dateFnsLocale })}
                              {' · '}
                              {s.tutor_name || '—'}
                              {hasTrialNoPackageReason && (
                                <>
                                  {' · '}
                                  <span className="text-red-600 font-medium">{t('dash.trialNoPackage')}</span>
                                </>
                              )}
                              {hasAttendanceReason && (
                                <>
                                  {' · '}
                                  <span className={isProKlaseAdmin ? 'text-amber-700 font-medium' : 'text-rose-600 font-medium'}>
                                    {attendanceAttentionSummary(
                                      s,
                                      t,
                                      isProKlaseAdmin && hasAttendanceReason,
                                    )}
                                  </span>
                                </>
                              )}
                              {hasPaymentReason && (
                                <>
                                  {' · '}
                                  <span className="font-medium">
                                    {isPendingConfirm ? (
                                      <span className="text-amber-700">{t('dash.reasonPendingConfirm')}</span>
                                    ) : diffMs <= 0 ? (
                                      <span className="text-red-600">{t('dash.deadlinePassed')}</span>
                                    ) : (
                                      <span className="text-orange-600">
                                        {t('dash.hoursLeft').replace('{n}', String(remainingHours))}
                                      </span>
                                    )}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                          {companyAttentionRowsKey && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissCompanyAttentionRow(s.id);
                              }}
                              className="flex min-h-[44px] min-w-[44px] flex-shrink-0 touch-manipulation items-center justify-center rounded-xl text-gray-400 hover:bg-white/70 hover:text-gray-600"
                              aria-label={t('dash.dismissRow')}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {hasAttendanceReason
                          && (isProKlaseAdmin ? end.getTime() <= Date.now() : s.status !== 'no_show') && (
                          <div className="mt-2 space-y-2">
                            <div className="flex gap-2">
                              {isProKlaseAdmin && (
                                <button
                                  type="button"
                                  disabled={markingNoShow || remindingTutorSessionId === s.id}
                                  onClick={() => void handleConfirmAttended(s)}
                                  className="flex min-h-[44px] flex-1 touch-manipulation items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                                >
                                  {t('compSess.markAttended')}
                                </button>
                              )}
                              {s.status !== 'no_show' && (
                                <button
                                  type="button"
                                  disabled={markingNoShow || remindingTutorSessionId === s.id}
                                  onClick={() => setNoShowTarget(s)}
                                  className="flex min-h-[44px] flex-1 touch-manipulation items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
                                >
                                  {t('companyDash.confirmNoShowShort')}
                                </button>
                              )}
                            </div>
                            {isProKlaseAdmin && (
                              <button
                                type="button"
                                disabled={
                                  markingNoShow
                                  || remindingTutorSessionId === s.id
                                  || (() => {
                                    const lastSent = s.status_reminder_last_sent_at
                                      ? Date.parse(s.status_reminder_last_sent_at)
                                      : NaN;
                                    return Number.isFinite(lastSent)
                                      && Date.now() - lastSent < TUTOR_OUTCOME_REMINDER_COOLDOWN_MS;
                                  })()
                                }
                                onClick={() => void handleSendTutorOutcomeReminder(s)}
                                className="flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                {remindingTutorSessionId === s.id
                                  ? t('companyDash.tutorOutcomeReminderSending')
                                  : t('companyDash.sendTutorOutcomeReminder')}
                              </button>
                            )}
                          </div>
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

        {(activeTutors > 0 || (showFinanceTotals && recentPayments.length > 0)) && (
          <div className={`grid gap-6 ${activeTutors > 0 && showFinanceTotals && recentPayments.length > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            {showFinanceTotals && (
            <div role="region" aria-label={t('companyDash.recentPayments')} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">{t('companyDash.recentPayments')}</h2>
                </div>
                <Link
                  to={orgBasePath === '/school' ? `${orgBasePath}/finance?tab=payments` : `${orgBasePath}/finance`}
                  className="flex min-h-[44px] shrink-0 touch-manipulation items-center gap-1 text-right text-xs text-indigo-600 hover:underline"
                >
                  {t('common.finance')} <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {paymentsError && retryNotice}
              {paymentsLoading && recentPayments.length === 0 ? (
                <p role="status" data-testid="dashboard-payments-loading" className="text-sm text-gray-500 text-center py-8">{t('common.loading')}</p>
              ) : paymentsError && recentPayments.length === 0 ? null : recentPayments.length === 0 ? (
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
                    <div key={p.id} className="flex items-center gap-1 rounded-xl bg-gray-50 p-3 pr-1.5">
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.subtitle}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-gray-900">{fmt(p.amount)}</p>
                          <p className="text-xs text-gray-400">
                            {format(new Date(p.paidAt), 'd MMM', { locale: dateFnsLocale })}
                          </p>
                        </div>
                      </div>
                      {companyPaymentRowsKey && (
                        <button
                          type="button"
                          onClick={() => dismissCompanyPaymentRow(p.id)}
                          className="flex min-h-[44px] min-w-[44px] flex-shrink-0 touch-manipulation items-center justify-center self-center rounded-xl text-gray-400 hover:bg-white hover:text-gray-700"
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
            )}

            {activeTutors > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-red-400" />
                    <h2 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">{t('companyDash.cancelledPaid')}</h2>
                  </div>
                  <Link to={`${orgBasePath}/sessions`} className="flex min-h-[44px] shrink-0 touch-manipulation items-center gap-1 text-right text-xs text-indigo-600 hover:underline">
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

      <MarkStudentNoShowDialog
        open={!!noShowTarget}
        onOpenChange={(open) => {
          if (!open) setNoShowTarget(null);
        }}
        sessionStart={noShowTarget ? new Date(noShowTarget.start_time) : new Date()}
        sessionEnd={noShowTarget ? new Date(noShowTarget.end_time) : new Date()}
        saving={markingNoShow}
        onConfirm={handleConfirmNoShow}
      />
    </>
  );
}
