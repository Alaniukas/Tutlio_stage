import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format, type Locale as DateFnsLocale } from 'date-fns';
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileClock,
  ListTodo,
  Activity,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import MarkStudentNoShowDialog from '@/components/MarkStudentNoShowDialog';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import { useDismissibleDashboardItemIds } from '@/hooks/useDismissibleDashboardItemIds';
import { useMarketMoney } from '@/hooks/useMarketMoney';
import { authHeaders } from '@/lib/apiHelpers';
import { deriveAttendance, isAttendanceFlagged } from '@/lib/attendance';
import { confirmSessionOutcome } from '@/lib/confirmSessionOutcome';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useTranslation } from '@/lib/i18n';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import {
  isSchoolParentConfirmationPending,
  buildSchoolAdminActionQueue,
  buildSchoolActivityFeed,
  schoolParentConfirmationLabel,
  sumPendingSchoolInvoices,
} from '@/lib/schoolDashboard';
import {
  schoolActivitySummary,
  schoolMeetingOccurrences,
  type SchoolMeetingRow,
} from '@/lib/schoolSessionMonitoring';
import { schoolDate } from '@/lib/schoolTime';
import { supabase } from '@/lib/supabase';

type SchoolDashboardSession = SchoolMeetingRow & {
  id: string;
  tutor_id: string;
  student_id: string;
  student_name: string;
  tutor_name: string;
  start_time: string;
  end_time: string;
  status: string;
  topic?: string | null;
  meeting_link?: string | null;
  tutor_joined_at?: string | null;
  student_joined_at?: string | null;
  tutor_comment?: string | null;
  class_group_id?: string | null;
  status_confirmed_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  cancellation_reason?: string | null;
  paid?: boolean | null;
  price?: number | string | null;
};

type PendingContract = {
  id: string;
  kind?: string | null;
  signing_status?: string | null;
  completion_submitted_at?: string | null;
  accepted_at?: string | null;
  signatures?: Array<{ role?: string | null; status?: string | null }> | null;
  sent_at?: string | null;
  created_at?: string | null;
  signed_at?: string | null;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  student_name: string;
};

type PendingInvoice = {
  id: string;
  period_start: string;
  period_end: string;
  total_eur: number | string;
  payment_status: string;
  due_date?: string | null;
  created_at?: string | null;
  student_name: string;
};

type DashboardData = {
  sessions: SchoolDashboardSession[];
  contracts: PendingContract[];
  invoices: PendingInvoice[];
  groups: Array<{
    id: string;
    name: string;
    admin_action_required?: boolean | null;
    admin_action_note?: string | null;
    admin_action_requested_at?: string | null;
    updated_at?: string | null;
    tutor_name?: string | null;
    suspension_started_at?: string | null;
    suspension_until?: string | null;
    suspension_resumed_at?: string | null;
    suspension_reason?: string | null;
  }>;
};

const EMPTY_DATA: DashboardData = { sessions: [], contracts: [], invoices: [], groups: [] };

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function startOfSchoolDay(value: Date): Date {
  const result = schoolDate(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfSchoolDay(value: Date): Date {
  const result = schoolDate(value);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addCalendarDays(value: Date, days: number): Date {
  const result = schoolDate(value);
  result.setDate(result.getDate() + days);
  return result;
}

function attendanceIssueLabel(
  session: SchoolDashboardSession,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const attendance = deriveAttendance(session);
  const time = (iso: string | null | undefined) => (
    iso ? format(schoolDate(iso), 'HH:mm') : ''
  );
  const issues: string[] = [];
  if (attendance.tutor === 'missing') issues.push(t('att.tutorMissing'));
  else if (attendance.tutor === 'late') issues.push(t('att.tutorLate', { time: time(session.tutor_joined_at) }));
  if (attendance.student === 'missing') issues.push(t('att.studentMissing'));
  else if (attendance.student === 'late') issues.push(t('att.studentLate', { time: time(session.student_joined_at) }));
  return issues.join(' · ') || t('companyDash.attendanceAttentionHint');
}

export default function SchoolDashboard() {
  const { t, dateFnsLocale } = useTranslation();
  const { fmt } = useMarketMoney();
  const { loading: accessLoading, membership, can } = useOrgAdminAccess();
  const navigate = useNavigate();
  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [noShowTarget, setNoShowTarget] = useState<SchoolDashboardSession | null>(null);
  const [markingNoShow, setMarkingNoShow] = useState(false);
  const attentionStorageKey = membership?.organizationId
    ? `tutlio:v1:school_dash_attention_rows:${membership.organizationId}`
    : undefined;
  const {
    dismissedIds,
    dismiss,
    restoreAll,
    ready: dismissalsReady,
  } = useDismissibleDashboardItemIds(attentionStorageKey);

  const loadData = useCallback(async () => {
    const organizationId = membership?.organizationId;
    if (!organizationId) {
      if (!accessLoading) setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError('');
    try {
      const now = schoolDate();
      const monthStart = schoolDate(now);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const attentionStart = addCalendarDays(now, -30);
      const queryStart = attentionStart.getTime() < monthStart.getTime() ? attentionStart : monthStart;
      const queryEnd = endOfSchoolDay(addCalendarDays(now, 14));

      const tutorsPromise = getOrgVisibleTutors(
        supabase as any,
        organizationId,
        'id, full_name, email',
      );
      const contractsPromise = can('contracts.view')
        ? fetchAllRows<any>((from, to) => supabase
            .from('school_contracts')
            .select('id, kind, signing_status, completion_submitted_at, accepted_at, sent_at, signed_at, created_at, pdf_url, signed_contract_url, student:students(full_name), signatures:school_contract_signatures(role, status)')
            .eq('organization_id', organizationId)
            .is('archived_at', null)
            .order('created_at', { ascending: false })
            .range(from, to))
        : Promise.resolve([]);
      const invoicesPromise = can('finance.view')
        ? fetchAllRows<any>((from, to) => supabase
            .from('school_monthly_invoices')
            .select('id, period_start, period_end, total_eur, payment_status, due_date, created_at, student:students(full_name)')
            .eq('organization_id', organizationId)
            .eq('payment_status', 'pending')
            .order('due_date', { ascending: true })
            .order('id')
            .range(from, to))
        : Promise.resolve([]);
      const groupsPromise = can('sessions.view')
        ? fetchAllRows<any>((from, to) => supabase
            .from('school_class_groups')
            .select('id, name, tutor_id, admin_action_required, admin_action_note, admin_action_requested_at, updated_at, suspension_started_at, suspension_until, suspension_resumed_at, suspension_reason')
            .eq('organization_id', organizationId)
            .order('updated_at', { ascending: false })
            .range(from, to))
        : Promise.resolve([]);

      const [tutors, contractRows, invoiceRows, groupRows] = await Promise.all([
        tutorsPromise,
        contractsPromise,
        invoicesPromise,
        groupsPromise,
      ]);
      const tutorIds = tutors.map(tutor => tutor.id);
      const tutorNames = new Map(tutors.map(tutor => [tutor.id, tutor.full_name || t('role.staffSchool')]));
      const sessionRows = can('sessions.view') && tutorIds.length > 0
        ? await fetchAllRows<any>((from, to) => supabase
            .from('sessions')
            .select('id, class_group_id, tutor_id, student_id, subject_id, start_time, end_time, status, topic, meeting_link, tutor_joined_at, student_joined_at, status_confirmed_at, cancellation_reason, no_show_reason, cancelled_by, cancelled_at, paid, price, created_at, tutor_comment, student:students(full_name), subjects(is_group)')
            .in('tutor_id', tutorIds)
            .gte('start_time', queryStart.toISOString())
            .lte('start_time', queryEnd.toISOString())
            .order('start_time')
            .order('id')
            .range(from, to))
        : [];

      if (currentRequest !== requestId.current) return;
      setData({
        sessions: sessionRows.map((row: any) => {
          const student = relatedOne<{ full_name?: string | null }>(row.student);
          const subject = relatedOne<{ is_group?: boolean | null }>(row.subjects);
          return {
            ...row,
            subjects: subject,
            student_name: student?.full_name || t('common.student'),
            tutor_name: tutorNames.get(row.tutor_id) || t('role.staffSchool'),
          } as SchoolDashboardSession;
        }),
        contracts: contractRows.map((row: any) => ({
            ...row,
            student_name: relatedOne<{ full_name?: string | null }>(row.student)?.full_name || t('common.student'),
          })),
        invoices: invoiceRows.map((row: any) => ({
          ...row,
          student_name: relatedOne<{ full_name?: string | null }>(row.student)?.full_name || t('common.student'),
        })),
        groups: groupRows.map((row: any) => ({
          ...row,
          tutor_name: tutorNames.get(row.tutor_id) || t('role.staffSchool'),
        })),
      });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setLoadError(error instanceof Error ? error.message : t('schoolDash.loadFailed'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [accessLoading, can, membership?.organizationId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const derived = useMemo(() => {
    const now = schoolDate();
    const todayStart = startOfSchoolDay(now).getTime();
    const todayEnd = endOfSchoolDay(now).getTime();
    const monthStart = schoolDate(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthRows = data.sessions.filter(row => {
      const instant = Date.parse(row.start_time);
      return instant >= monthStart.getTime() && instant <= now.getTime();
    });
    const monthSummary = schoolActivitySummary(monthRows, now);
    const occurrences = schoolMeetingOccurrences(data.sessions);
    const todayAll = occurrences
      .filter(({ row }) => {
        const instant = Date.parse(row.start_time || '');
        return row.status !== 'cancelled' && instant >= todayStart && instant <= todayEnd;
      })
      .sort((a, b) => Date.parse(a.row.start_time || '') - Date.parse(b.row.start_time || ''));
    const upcomingAll = occurrences
      .filter(({ row }) => {
        const instant = Date.parse(row.start_time || '');
        return row.status === 'active' && instant > todayEnd;
      })
      .sort((a, b) => Date.parse(a.row.start_time || '') - Date.parse(b.row.start_time || ''));
    const notHeld = schoolMeetingOccurrences(monthRows)
      .filter(({ row }) => row.status === 'cancelled' || row.status === 'no_show'
        || (row.status === 'active' && Date.parse(row.end_time || row.start_time || '') < now.getTime()))
      .sort((a, b) => Date.parse(b.row.start_time || '') - Date.parse(a.row.start_time || ''))
      .slice(0, 8);
    const attention = data.sessions
      .filter(row => isAttendanceFlagged(row, now))
      .sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time));
    return {
      monthSummary,
      today: todayAll.slice(0, 8),
      todayCount: todayAll.length,
      upcoming: upcomingAll.slice(0, 8),
      upcomingCount: upcomingAll.length,
      notHeld,
      attention,
    };
  }, [data.sessions]);

  const pendingContracts = useMemo(
    () => data.contracts.filter(isSchoolParentConfirmationPending),
    [data.contracts],
  );
  const adminActions = useMemo(() => buildSchoolAdminActionQueue(data), [data]);
  const activityFeed = useMemo(() => buildSchoolActivityFeed(data), [data]);
  const visibleAttention = derived.attention.filter(row => !dismissedIds.has(row.id)).slice(0, 8);
  const pendingInvoiceTotal = sumPendingSchoolInvoices(data.invoices);

  const handleConfirmNoShow = async () => {
    if (!noShowTarget) return;
    const sessionId = noShowTarget.id;
    setMarkingNoShow(true);
    try {
      await confirmSessionOutcome({
        sessionId,
        currentStatus: noShowTarget.status,
        status: 'no_show',
        startTime: noShowTarget.start_time,
        endTime: noShowTarget.end_time,
      });
      setNoShowTarget(null);
      void loadData();
      void fetch('/api/notify-session-no-show', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    } catch (error) {
      alert(t('cal.confirmStatusError', { msg: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMarkingNoShow(false);
    }
  };

  if (loading || accessLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
        {t('schoolDash.loadFailed')}
        <button type="button" className="ml-3 font-medium underline" onClick={() => void loadData()}>
          {t('stuSess.retryLoad')}
        </button>
      </div>
    );
  }

  const summaryCards = [
    {
      label: t('schoolDash.today'),
      value: derived.todayCount,
      sub: t('schoolDash.scheduledToday'),
      icon: CalendarDays,
      tone: 'bg-blue-100 text-blue-700',
    },
    {
      label: t('schoolDash.upcoming'),
      value: derived.upcomingCount,
      sub: t('schoolDash.nextFourteenDays'),
      icon: CalendarClock,
      tone: 'bg-indigo-100 text-indigo-700',
    },
    {
      label: t('schoolDash.completedThisMonth'),
      value: derived.monthSummary.completed,
      sub: t('schoolDash.groupOnce'),
      icon: CheckCircle2,
      tone: 'bg-emerald-100 text-emerald-700',
    },
    {
      label: t('schoolDash.attendance'),
      value: derived.monthSummary.attendanceRate === null ? '–' : `${derived.monthSummary.attendanceRate}%`,
      sub: t('schoolDash.attendanceRatio', {
        attended: derived.monthSummary.attendedStudents,
        confirmed: derived.monthSummary.confirmedAttendance,
      }),
      icon: UserCheck,
      tone: 'bg-cyan-100 text-cyan-700',
    },
    ...(can('contracts.view') ? [{
      label: t('schoolDash.parentConfirmations'),
      value: pendingContracts.length,
      sub: t('schoolDash.contractsWaiting'),
      icon: FileClock,
      tone: 'bg-amber-100 text-amber-700',
    }] : []),
    ...(can('finance.view') ? [{
      label: t('schoolDash.unpaidInvoices'),
      value: data.invoices.length,
      sub: can('finance.totals') ? fmt(pendingInvoiceTotal) : t('schoolDash.monthEndInvoices'),
      icon: CreditCard,
      tone: 'bg-rose-100 text-rose-700',
    }] : []),
  ];

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">{t('schoolDash.greeting', { name: membership?.organizationName || '' })}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {format(schoolDate(), 'cccc, d MMMM yyyy', { locale: dateFnsLocale })}
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm" aria-labelledby="school-admin-work-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/70 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-amber-700" />
              <div>
                <h2 id="school-admin-work-title" className="font-semibold text-gray-950">Reikia administracijos veiksmo</h2>
                <p className="text-xs text-amber-800">Sąrašas susidaro automatiškai ir dingsta sutvarkius priežastį.</p>
              </div>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-amber-800 shadow-sm">{adminActions.length}</span>
          </div>
          {adminActions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-5 text-sm text-emerald-700 sm:px-5">
              <CheckCircle2 className="h-4 w-4" /> Šiuo metu nebaigtų administracijos darbų nėra.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {adminActions.slice(0, 12).map((item) => (
                <Link key={item.id} to={item.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-amber-50/40 sm:px-5">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.priority === 3 ? 'bg-rose-500' : item.priority === 2 ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-950">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-gray-500">{item.detail}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                </Link>
              ))}
              {adminActions.length > 12 ? (
                <p className="px-5 py-3 text-xs text-gray-500">Rodoma 12 iš {adminActions.length}. Likę darbai matomi atitinkamuose sistemos languose.</p>
              ) : null}
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {summaryCards.map(({ label, value, sub, icon: Icon, tone }) => (
            <div key={label} className="min-w-0 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm sm:p-4">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="mt-0.5 text-xs font-medium leading-snug text-gray-600">{label}</p>
              <p className="mt-0.5 text-xs leading-snug text-gray-400">{sub}</p>
            </div>
          ))}
        </div>

        <DashboardSection title="Kas vyksta sistemoje" icon={Activity} iconClassName="text-indigo-600">
          {activityFeed.length === 0 ? (
            <EmptyState text="Naujausių pakeitimų dar nėra." />
          ) : (
            <div className="divide-y divide-gray-100">
              {activityFeed.slice(0, 12).map((item) => (
                <Link key={item.id} to={item.href} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 hover:text-indigo-700">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{item.actor} · {item.detail}</span>
                  </span>
                  <time className="shrink-0 text-xs text-gray-400" dateTime={item.occurredAt}>
                    {format(schoolDate(item.occurredAt), 'd MMM, HH:mm', { locale: dateFnsLocale })}
                  </time>
                </Link>
              ))}
            </div>
          )}
        </DashboardSection>

        {can('sessions.view') ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DashboardSection
              title={t('schoolDash.todayAndUpcoming')}
              icon={CalendarDays}
              iconClassName="text-blue-600"
              link="/school/sessions"
              linkLabel={t('schoolDash.allActivities')}
            >
              {derived.today.length === 0 && derived.upcoming.length === 0 ? (
                <EmptyState text={t('schoolDash.noUpcoming')} />
              ) : (
                <div className="space-y-4">
                  <MeetingList
                    title={t('schoolDash.today')}
                    occurrences={derived.today}
                    onOpen={sessionId => navigate(`/school/sessions?open=${encodeURIComponent(sessionId)}`)}
                    dateFnsLocale={dateFnsLocale}
                    showDate={false}
                    emptyText={t('schoolDash.noToday')}
                  />
                  <MeetingList
                    title={t('schoolDash.upcoming')}
                    occurrences={derived.upcoming}
                    onOpen={sessionId => navigate(`/school/sessions?open=${encodeURIComponent(sessionId)}`)}
                    dateFnsLocale={dateFnsLocale}
                    showDate
                    emptyText={t('schoolDash.noLater')}
                  />
                </div>
              )}
            </DashboardSection>

            <DashboardSection
              title={t('schoolDash.completedAndAttendance')}
              icon={ClipboardCheck}
              iconClassName="text-emerald-600"
              link="/school/stats"
              linkLabel={t('companyDash.statistics')}
            >
              <div className="grid grid-cols-2 gap-3">
                <SmallMetric label={t('schoolDash.completed')} value={derived.monthSummary.completed} />
                <SmallMetric
                  label={t('schoolDash.attendance')}
                  value={derived.monthSummary.attendanceRate === null ? '–' : `${derived.monthSummary.attendanceRate}%`}
                />
                <SmallMetric label={t('schoolDash.attendedChildren')} value={derived.monthSummary.attendedStudents} />
                <SmallMetric label={t('schoolDash.absentChildren')} value={derived.monthSummary.absentStudents} tone="text-rose-700" />
                <SmallMetric label={t('schoolDash.unconfirmedAttendance')} value={derived.monthSummary.unconfirmedStudents} tone="text-amber-700" />
                <SmallMetric label={t('schoolDash.cancelled')} value={derived.monthSummary.cancelled} tone="text-gray-700" />
              </div>
              <p className="mt-4 text-xs leading-5 text-gray-500">{t('schoolDash.attendanceExplanation')}</p>
            </DashboardSection>

            <DashboardSection
              title={t('schoolDash.notHeldOrCancelled')}
              icon={UserX}
              iconClassName="text-rose-600"
              link="/school/sessions"
              linkLabel={t('schoolDash.allActivities')}
            >
              {derived.notHeld.length === 0 ? (
                <EmptyState text={t('schoolDash.noNotHeld')} />
              ) : (
                <div className="space-y-2">
                  {derived.notHeld.map(({ key, row, studentCount }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => navigate(`/school/sessions?open=${encodeURIComponent(String(row.id || ''))}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/40 p-3 text-left transition-colors hover:bg-rose-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{row.topic || row.student_name}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {format(schoolDate(row.start_time || ''), 'd MMM, HH:mm', { locale: dateFnsLocale })}
                          {' · '}{row.tutor_name}
                          {studentCount > 1 ? ` · ${t('schoolDash.childrenCount', { count: studentCount })}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-rose-700">
                        {row.status === 'cancelled'
                          ? t('schoolDash.cancelled')
                          : row.status === 'no_show'
                            ? t('schoolDash.didNotOccur')
                            : t('schoolDash.awaitingOutcome')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </DashboardSection>

            <DashboardSection
              title={t('companyDash.needsAttention')}
              icon={AlertCircle}
              iconClassName="text-amber-600"
            >
              {derived.attention.length === 0 ? (
                <EmptyState text={t('schoolDash.noAttention')} />
              ) : dismissalsReady && visibleAttention.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-gray-500">{t('dash.allRowsHiddenHint')}</p>
                  <button type="button" onClick={restoreAll} className="mt-2 text-sm font-medium text-indigo-600 hover:underline">
                    {t('dash.restoreHiddenRows')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleAttention.map(row => (
                    <div key={row.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/school/sessions?open=${encodeURIComponent(row.id)}`)}
                          className="min-w-0 flex-1 py-1 text-left"
                        >
                          <p className="truncate text-sm font-semibold text-gray-900">{row.student_name}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 sm:truncate">
                            {format(schoolDate(row.start_time), 'd MMM, HH:mm', { locale: dateFnsLocale })}
                            {' · '}{row.tutor_name}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-relaxed text-rose-700">{attendanceIssueLabel(row, t)}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => dismiss(row.id)}
                          className="flex min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:text-gray-700"
                          aria-label={t('dash.dismissRow')}
                        >
                          ×
                        </button>
                      </div>
                      {row.status !== 'no_show' ? (
                        <button
                          type="button"
                          onClick={() => setNoShowTarget(row)}
                          className="mt-2 flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          {t('companyDash.confirmNoShowShort')}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {dismissedIds.size > 0 && visibleAttention.length > 0 ? (
                    <button type="button" onClick={restoreAll} className="w-full pt-1 text-center text-xs font-medium text-indigo-600 hover:underline">
                      {t('dash.restoreHiddenRows')}
                    </button>
                  ) : null}
                </div>
              )}
            </DashboardSection>
          </div>
        ) : null}

        {(can('contracts.view') || can('finance.view')) ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {can('contracts.view') ? (
              <DashboardSection
                title={t('schoolDash.parentConfirmations')}
                icon={FileClock}
                iconClassName="text-amber-600"
                link="/school/contracts"
                linkLabel={t('schoolDash.openContracts')}
              >
                {pendingContracts.length === 0 ? (
                  <EmptyState text={t('schoolDash.noParentConfirmations')} />
                ) : (
                  <div className="space-y-2">
                    {pendingContracts.slice(0, 8).map(contract => {
                      const pendingKind = schoolParentConfirmationLabel(contract);
                      return (
                        <Link
                          key={contract.id}
                          to="/school/contracts"
                          className="block rounded-xl border border-amber-100 bg-amber-50/40 p-3 transition-colors hover:bg-amber-50"
                        >
                          <p className="text-sm font-semibold text-gray-900">{contract.student_name}</p>
                          <p className="mt-0.5 text-xs text-amber-800">
                            {pendingKind === 'offer'
                              ? t('schoolDash.waitingOfferAcceptance')
                              : pendingKind === 'signature'
                                ? t('schoolDash.waitingParentSignature')
                                : t('schoolDash.waitingParentData')}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </DashboardSection>
            ) : null}

            {can('finance.view') ? (
              <DashboardSection
                title={t('schoolDash.unpaidMonthlyInvoices')}
                icon={CreditCard}
                iconClassName="text-rose-600"
                link="/school/finance?tab=payments"
                linkLabel={t('schoolDash.openPayments')}
              >
                {data.invoices.length === 0 ? (
                  <EmptyState text={t('schoolDash.noUnpaidInvoices')} />
                ) : (
                  <div className="space-y-2">
                    {data.invoices.slice(0, 8).map(invoice => (
                      <Link
                        key={invoice.id}
                        to="/school/finance?tab=payments"
                        className="flex items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/40 p-3 transition-colors hover:bg-rose-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{invoice.student_name}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {format(schoolDate(invoice.period_start), 'MMMM yyyy', { locale: dateFnsLocale })}
                            {invoice.due_date ? ` · ${t('schoolDash.dueDate', { date: format(schoolDate(invoice.due_date), 'd MMM', { locale: dateFnsLocale }) })}` : ''}
                          </p>
                        </div>
                        {can('finance.totals') ? (
                          <span className="shrink-0 text-sm font-semibold text-rose-700">{fmt(Number(invoice.total_eur) || 0)}</span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                )}
              </DashboardSection>
            ) : null}
          </div>
        ) : null}
      </div>

      <MarkStudentNoShowDialog
        open={Boolean(noShowTarget)}
        onOpenChange={open => { if (!open) setNoShowTarget(null); }}
        sessionStart={noShowTarget ? new Date(noShowTarget.start_time) : new Date()}
        sessionEnd={noShowTarget ? new Date(noShowTarget.end_time) : new Date()}
        saving={markingNoShow}
        onConfirm={handleConfirmNoShow}
      />
    </>
  );
}

function DashboardSection({
  title,
  icon: Icon,
  iconClassName,
  link,
  linkLabel,
  children,
}: {
  title: string;
  icon: typeof CalendarDays;
  iconClassName: string;
  link?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className={`h-5 w-5 shrink-0 ${iconClassName}`} />
          <h2 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">{title}</h2>
        </div>
        {link && linkLabel ? (
          <Link to={link} className="flex min-h-[44px] shrink-0 touch-manipulation items-center gap-1 text-right text-xs font-medium text-indigo-600 hover:underline">
            {linkLabel}<ChevronRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MeetingList({
  title,
  occurrences,
  onOpen,
  dateFnsLocale,
  showDate,
  emptyText,
}: {
  title: string;
  occurrences: ReturnType<typeof schoolMeetingOccurrences<SchoolDashboardSession>>;
  onOpen: (sessionId: string) => void;
  dateFnsLocale: DateFnsLocale | undefined;
  showDate: boolean;
  emptyText: string;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      {occurrences.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {occurrences.map(({ key, row, rows, studentCount }) => {
            const studentNames = [...new Set(rows.map(item => item.student_name).filter(Boolean))];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpen(String(row.id || ''))}
                className="flex w-full items-center gap-3 rounded-xl bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
              >
                <div className="h-10 w-1 shrink-0 rounded-full bg-blue-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{row.topic || studentNames.join(', ')}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {showDate ? `${format(schoolDate(row.start_time || ''), 'EEE, d MMM · ', { locale: dateFnsLocale })}` : ''}
                    {format(schoolDate(row.start_time || ''), 'HH:mm')}
                    {' · '}{row.tutor_name}
                    {studentCount > 1 ? ` · ${t('schoolDash.childrenCount', { count: studentCount })}` : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SmallMetric({ label, value, tone = 'text-gray-900' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-gray-400">{text}</p>;
}
