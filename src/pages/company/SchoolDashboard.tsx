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
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useTranslation } from '@/lib/i18n';
import { buildNoShowSessionPatch, defaultNoShowWhenForNow } from '@/lib/noShowWhen';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import {
  isSchoolParentConfirmationPending,
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
};

const EMPTY_DATA: DashboardData = { sessions: [], contracts: [], invoices: [] };

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
            .select('id, kind, signing_status, completion_submitted_at, accepted_at, sent_at, created_at, student:students(full_name), signatures:school_contract_signatures(role, status)')
            .eq('organization_id', organizationId)
            .is('archived_at', null)
            .in('signing_status', ['sent', 'signed_by_school'])
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

      const [tutors, contractRows, invoiceRows] = await Promise.all([
        tutorsPromise,
        contractsPromise,
        invoicesPromise,
      ]);
      const tutorIds = tutors.map(tutor => tutor.id);
      const tutorNames = new Map(tutors.map(tutor => [tutor.id, tutor.full_name || t('role.staffSchool')]));
      const sessionRows = can('sessions.view') && tutorIds.length > 0
        ? await fetchAllRows<any>((from, to) => supabase
            .from('sessions')
            .select('id, class_group_id, tutor_id, student_id, subject_id, start_time, end_time, status, topic, meeting_link, tutor_joined_at, student_joined_at, status_confirmed_at, cancellation_reason, no_show_reason, cancelled_by, tutor_comment, student:students(full_name), subjects(is_group)')
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
        contracts: contractRows
          .filter(isSchoolParentConfirmationPending)
          .map((row: any) => ({
            ...row,
            student_name: relatedOne<{ full_name?: string | null }>(row.student)?.full_name || t('common.student'),
          })),
        invoices: invoiceRows.map((row: any) => ({
          ...row,
          student_name: relatedOne<{ full_name?: string | null }>(row.student)?.full_name || t('common.student'),
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

  const visibleAttention = derived.attention.filter(row => !dismissedIds.has(row.id)).slice(0, 8);
  const pendingInvoiceTotal = sumPendingSchoolInvoices(data.invoices);

  const handleConfirmNoShow = async () => {
    if (!noShowTarget) return;
    const sessionId = noShowTarget.id;
    setMarkingNoShow(true);
    const when = defaultNoShowWhenForNow(
      new Date(noShowTarget.start_time),
      new Date(noShowTarget.end_time),
    );
    const patch = buildNoShowSessionPatch(when, noShowTarget.tutor_comment);
    const { error } = await supabase.from('sessions').update(patch).eq('id', sessionId);
    setMarkingNoShow(false);
    if (error) return;
    setNoShowTarget(null);
    void loadData();
    void fetch('/api/notify-session-no-show', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
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
      value: data.contracts.length,
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
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">{t('schoolDash.greeting', { name: membership?.organizationName || '' })}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {format(schoolDate(), 'cccc, d MMMM yyyy', { locale: dateFnsLocale })}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {summaryCards.map(({ label, value, sub, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="mt-0.5 text-xs font-medium text-gray-600">{label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
            </div>
          ))}
        </div>

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
                    <div key={row.id} className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/school/sessions?open=${encodeURIComponent(row.id)}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-semibold text-gray-900">{row.student_name}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {format(schoolDate(row.start_time), 'd MMM, HH:mm', { locale: dateFnsLocale })}
                          {' · '}{row.tutor_name}
                        </p>
                        <p className="mt-1 text-xs font-medium text-rose-700">{attendanceIssueLabel(row, t)}</p>
                      </button>
                      {row.status !== 'no_show' ? (
                        <button
                          type="button"
                          onClick={() => setNoShowTarget(row)}
                          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          {t('companyDash.confirmNoShowShort')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => dismiss(row.id)}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-white hover:text-gray-700"
                        aria-label={t('dash.dismissRow')}
                      >
                        ×
                      </button>
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
                {data.contracts.length === 0 ? (
                  <EmptyState text={t('schoolDash.noParentConfirmations')} />
                ) : (
                  <div className="space-y-2">
                    {data.contracts.slice(0, 8).map(contract => {
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
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={`h-5 w-5 shrink-0 ${iconClassName}`} />
          <h2 className="truncate text-lg font-bold text-gray-900">{title}</h2>
        </div>
        {link && linkLabel ? (
          <Link to={link} className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
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
