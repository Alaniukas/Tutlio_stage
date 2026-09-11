import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { companyStatsCacheKey, getCached, setCache } from '@/lib/dataCache';
import {
  TrendingUp,
  Award,
  AlertTriangle,
  Wallet,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { useStaffLabels } from '@/hooks/useStaffLabels';
import { useTranslation } from '@/lib/i18n';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import { useMarketMoney } from '@/hooks/useMarketMoney';
import { isProKlaseOrg, orgFeeProfile } from '@/lib/marketMoney';
import { sumOrgTutorLessonsPayEur } from '@/lib/orgTutorLessonPay';
import {
  countConductedOrgSessions,
  filterConductedOrgSessions,
} from '@/lib/orgTutorConductedSessions';
import {
  countProKlaseRealizedSessions,
} from '@/lib/proKlaseTutorPay';
import {
  packageClientPaidEur,
  standaloneSessionClientPaidEur,
  sumProKlaseRealizedPaidTutorPayEur,
  type ProKlaseAdminSession,
} from '@/lib/proKlaseAdminFinance';
import {
  countCancellationAttribution,
  countUserInitiatedCancellations,
  formatCancellationBreakdown,
} from '@/lib/session-stats';
import {
  defaultStatsDateRange,
  normalizeStatsDateRange,
  statsDateRangeKey,
} from '@/lib/statsDateRange';
import { schoolCalendarInstant } from '@/lib/schoolTime';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  schoolActivitySummary,
  type SchoolActivitySummary,
} from '@/lib/schoolSessionMonitoring';

interface TutorStat {
  id: string;
  full_name: string;
  scheduledSessions: number;
  completedSessions: number;
  upcomingSessions: number;
  noShowMeetings: number;
  attendanceJoined: number;
  attendanceAbsent: number;
  attendanceUnconfirmed: number;
  attendanceRate: number | null;
  cancelledByTutor: number;
  cancelledByStudent: number;
  cancelledByAdmin: number;
  totalCancelled: number;
  earnings: number;
  companyCommission: number;
  netEarnings: number;
}

const EMPTY_SCHOOL_ACTIVITY: SchoolActivitySummary = {
  scheduled: 0,
  completed: 0,
  upcoming: 0,
  noShowMeetings: 0,
  cancelled: 0,
  awaitingOutcome: 0,
  attendedStudents: 0,
  absentStudents: 0,
  unconfirmedStudents: 0,
  confirmedAttendance: 0,
  attendanceRate: null,
};

export default function CompanyStats() {
  const { t } = useTranslation();
  const { isSchool } = useStaffLabels();
  const staffShareLabel = isSchool ? t('compStats.staffShare') : t('compStats.tutorShare');
  const cancellationBreakdown = (
    stat: Pick<TutorStat, 'totalCancelled' | 'cancelledByTutor' | 'cancelledByStudent' | 'cancelledByAdmin'>,
  ) =>
    isSchool ? String(stat.totalCancelled) : formatCancellationBreakdown(stat, (role, count) => {
      if (role === 'tutor') return t('stats.cancellationPartTutor', { count });
      if (role === 'student') return t('stats.cancellationPartStudent', { count });
      return t('stats.cancellationPartAdmin', { count });
    });
  const { fmt } = useMarketMoney();
  const { can } = useOrgAdminAccess();
  const showFinanceTotals = can('finance.totals');
  const initialOrgId = getCached<any>('company_dashboard')?.organizationId as string | undefined;
  const initialCacheKey = initialOrgId ? companyStatsCacheKey(initialOrgId) : null;
  const [appliedRange, setAppliedRange] = useState<{ start: Date; end: Date } | null>(null);
  const stCache = !appliedRange && initialCacheKey ? getCached<any>(initialCacheKey) : null;
  const loadRequest = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(!stCache);
  const [tutorStats, setTutorStats] = useState<TutorStat[]>(stCache?.tutorStats ?? []);
  const [totalEarnings, setTotalEarnings] = useState(stCache?.totalEarnings ?? 0);
  const [totalCompanyCommission, setTotalCompanyCommission] = useState(stCache?.totalCompanyCommission ?? 0);
  const [totalNetEarnings, setTotalNetEarnings] = useState(stCache?.totalNetEarnings ?? 0);
  const [totalSessions, setTotalSessions] = useState(stCache?.totalSessions ?? 0);
  const [totalCancelled, setTotalCancelled] = useState(stCache?.totalCancelled ?? 0);
  const [schoolActivity, setSchoolActivity] = useState<SchoolActivitySummary>(
    stCache?.schoolActivity ?? EMPTY_SCHOOL_ACTIVITY,
  );
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const effectiveRange = appliedRange ?? defaultStatsDateRange();
  const rangeKey = statsDateRangeKey(effectiveRange);

  useEffect(() => {
    loadData(effectiveRange, !appliedRange);
  }, [rangeKey, showFinanceTotals, appliedRange, isSchool]);

  const loadData = async (range: { start: Date; end: Date }, cacheResult: boolean) => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
    const start = isSchool ? schoolCalendarInstant(range.start) : range.start;
    const end = isSchool ? schoolCalendarInstant(range.end) : range.end;
    const { startIso, endIso } = isSchool
      ? {
          startIso: new Date(new Date(start).setHours(0, 0, 0, 0)).toISOString(),
          endIso: new Date(new Date(end).setHours(23, 59, 59, 999)).toISOString(),
        }
      : normalizeStatsDateRange(start, end);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!adminRow) return;

    const tutorList = await getOrgVisibleTutors(
      supabase as any,
      adminRow.organization_id,
      'id, full_name, email, company_commission_percent, company_commission_by_subject',
    );

    const tutorIds = tutorList.map(t => t.id);
    const sessionQuery = () => supabase
      .from('sessions')
      .select('id, class_group_id, start_time, end_time, tutor_id, student_id, status, payment_status, price, cancelled_by, paid, is_complimentary, lesson_package_id, subject_id, student_joined_at, status_confirmed_at, subjects(is_trial, is_group)')
      .in('tutor_id', tutorIds)
      .gte('start_time', startIso)
      .lte('start_time', endIso);

    const allSessions = tutorIds.length
      ? await fetchAllRows<any>((from, to) => sessionQuery().order('start_time').order('id').range(from, to))
      : [];
    const proKlase = !isSchool && isProKlaseOrg(adminRow.organization_id);
    const proKlaseFeeProfile = proKlase ? orgFeeProfile(adminRow.organization_id) : null;

    let packagesByTutor = new Map<string, number>();
    if (proKlase) {
      const { data: packages } = await supabase
        .from('lesson_packages')
        .select('tutor_id, total_price, price_per_lesson, total_lessons, paid, payment_status, paid_at')
        .in('tutor_id', tutorIds)
        .eq('paid', true)
        .gte('paid_at', startIso)
        .lte('paid_at', endIso)
        .limit(3000);
      for (const pkg of packages || []) {
        const tutorId = String((pkg as { tutor_id?: string }).tutor_id || '');
        packagesByTutor.set(
          tutorId,
          (packagesByTutor.get(tutorId) || 0) + packageClientPaidEur(pkg as any, proKlaseFeeProfile),
        );
      }
    }

    const stats: TutorStat[] = tutorList.map(tutor => {
      const tutorSessions = allSessions.filter(s => s.tutor_id === tutor.id);
      if (isSchool) {
        const activity = schoolActivitySummary(tutorSessions);
        return {
          id: tutor.id,
          full_name: tutor.full_name,
          scheduledSessions: activity.scheduled,
          completedSessions: activity.completed,
          upcomingSessions: activity.upcoming,
          noShowMeetings: activity.noShowMeetings,
          attendanceJoined: activity.attendedStudents,
          attendanceAbsent: activity.absentStudents,
          attendanceUnconfirmed: activity.unconfirmedStudents,
          attendanceRate: activity.attendanceRate,
          cancelledByTutor: 0,
          cancelledByStudent: 0,
          cancelledByAdmin: 0,
          totalCancelled: activity.cancelled,
          earnings: 0,
          companyCommission: 0,
          netEarnings: 0,
        };
      }

      const cancellation = countCancellationAttribution(tutorSessions);
      const tutorPayPerSession = (tutor as any).company_commission_percent ?? 0;

      if (proKlase) {
        const mapped: ProKlaseAdminSession[] = tutorSessions.map((s: any) => ({
          status: s.status,
          payment_status: s.payment_status,
          paid: s.paid,
          price: s.price,
          is_complimentary: s.is_complimentary,
          lesson_package_id: s.lesson_package_id,
          subjects: Array.isArray(s.subjects) ? s.subjects[0] : s.subjects,
        }));
        const clientPaidEur =
          (packagesByTutor.get(tutor.id) || 0) +
          mapped.reduce((sum, session) => sum + standaloneSessionClientPaidEur(session), 0);
        const netEarnings = sumProKlaseRealizedPaidTutorPayEur(mapped, tutorPayPerSession);
        const completedSessions = countProKlaseRealizedSessions(mapped);
        return {
          id: tutor.id,
          full_name: tutor.full_name,
          scheduledSessions: tutorSessions.filter(s => s.status !== 'cancelled').length,
          completedSessions,
          upcomingSessions: 0,
          noShowMeetings: 0,
          attendanceJoined: 0,
          attendanceAbsent: 0,
          attendanceUnconfirmed: 0,
          attendanceRate: null,
          cancelledByTutor: cancellation.cancelledByTutor,
          cancelledByStudent: cancellation.cancelledByStudent,
          cancelledByAdmin: cancellation.cancelledByAdmin,
          totalCancelled: cancellation.totalCancelled,
          earnings: clientPaidEur,
          companyCommission: Math.round((clientPaidEur - netEarnings) * 100) / 100,
          netEarnings,
        };
      }

      const conducted = filterConductedOrgSessions(tutorSessions);
      const earnings = conducted.reduce((sum, s) => sum + (Number((s as any).price) || 0), 0);
      const netEarnings = sumOrgTutorLessonsPayEur(
        conducted as Array<{ subject_id?: string | null; price?: number | null }>,
        tutorPayPerSession,
        (tutor as any).company_commission_by_subject,
        adminRow.organization_id,
      );
      const companyCommission = Math.round((earnings - netEarnings) * 100) / 100;

      return {
        id: tutor.id,
        full_name: tutor.full_name,
        scheduledSessions: tutorSessions.filter(s => s.status !== 'cancelled').length,
        completedSessions: countConductedOrgSessions(conducted),
        upcomingSessions: 0,
        noShowMeetings: 0,
        attendanceJoined: 0,
        attendanceAbsent: 0,
        attendanceUnconfirmed: 0,
        attendanceRate: null,
        cancelledByTutor: cancellation.cancelledByTutor,
        cancelledByStudent: cancellation.cancelledByStudent,
        cancelledByAdmin: cancellation.cancelledByAdmin,
        totalCancelled: cancellation.totalCancelled,
        earnings,
        companyCommission,
        netEarnings,
      };
    });

    const sorted = showFinanceTotals && !isSchool
      ? stats.sort((a, b) => b.earnings - a.earnings)
      : stats.sort((a, b) => b.completedSessions - a.completedSessions);
    const schoolSummary = isSchool ? schoolActivitySummary(allSessions) : EMPTY_SCHOOL_ACTIVITY;
    const te = stats.reduce((sum, s) => sum + s.earnings, 0);
    const tcc = stats.reduce((sum, s) => sum + s.companyCommission, 0);
    const tne = stats.reduce((sum, s) => sum + s.netEarnings, 0);
    const ts = isSchool ? schoolSummary.completed : stats.reduce((sum, s) => sum + s.completedSessions, 0);
    const tcn = isSchool ? schoolSummary.cancelled : stats.reduce((sum, s) => sum + s.totalCancelled, 0);

    if (request !== loadRequest.current) return;
    setSchoolActivity(schoolSummary);
    setTutorStats(sorted);
    setTotalEarnings(te);
    setTotalCompanyCommission(tcc);
    setTotalNetEarnings(tne);
    setTotalSessions(ts);
    setTotalCancelled(tcn);

    if (cacheResult) {
      setCache(companyStatsCacheKey(adminRow.organization_id), {
        tutorStats: sorted, totalEarnings: te, totalCompanyCommission: tcc,
        totalNetEarnings: tne, totalSessions: ts, totalCancelled: tcn, schoolActivity: schoolSummary,
      });
    }
    } catch (error) {
      if (request !== loadRequest.current) return;
      setLoadError(error instanceof Error ? error.message : 'Nepavyko įkelti statistikos.');
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  };

  const topEarner = showFinanceTotals && !isSchool ? tutorStats[0] : null;
  const mostCancellations = [...tutorStats].sort(
    (a, b) => countUserInitiatedCancellations(b) - countUserInitiatedCancellations(a),
  )[0];
  const mostCancellationsCount = mostCancellations
    ? countUserInitiatedCancellations(mostCancellations)
    : 0;

  if (loadError) {
    return (
      <div role="alert" className="p-4 text-red-700">
        {loadError}
        <button className="ml-3 underline" onClick={() => void loadData(effectiveRange, !appliedRange)}>
          Bandyti dar kartą
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (isSchool) {
    return (
      <SchoolActivityStatsView
        activity={schoolActivity}
        tutorStats={tutorStats}
        filterStartDate={filterStartDate}
        filterEndDate={filterEndDate}
        onStartDateChange={setFilterStartDate}
        onEndDateChange={setFilterEndDate}
        onApplyRange={(start, end) => setAppliedRange({ start, end })}
        onClear={() => {
          setFilterStartDate(null);
          setFilterEndDate(null);
          setAppliedRange(null);
        }}
      />
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-8 px-1 sm:px-0">
        {/* Header and date range — stacked for clear rhythm */}
        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t('compStats.pageTitle')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('compStats.pageSubtitle')}</p>
          </div>
          <DateRangeFilter
            className="border-gray-100 shadow-sm bg-white/80 p-4 sm:p-5 space-y-3"
            startDate={filterStartDate}
            endDate={filterEndDate}
            onStartDateChange={setFilterStartDate}
            onEndDateChange={setFilterEndDate}
            onApplyRange={(start, end) => setAppliedRange({ start, end })}
            onSearch={() => {
              if (filterStartDate && filterEndDate) {
                setAppliedRange({ start: filterStartDate, end: filterEndDate });
              }
            }}
            onClear={() => {
              setFilterStartDate(null);
              setFilterEndDate(null);
              setAppliedRange(null);
            }}
          />
        </div>

        {/* Summary cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${showFinanceTotals ? 'lg:grid-cols-4' : ''} gap-4`}>
          {showFinanceTotals ? (
            <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{fmt(totalEarnings)}</p>
              <p className="text-xs text-gray-500">{isSchool ? 'Gautos sutarčių įmokos' : t('compStats.totalRevenue')}</p>
            </div>
          </div>
          {!isSchool ? <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">{fmt(totalCompanyCommission)}</p>
              <p className="text-xs text-gray-500">{t('compStats.companyShare')}</p>
            </div>
          </div> : null}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-900">{fmt(totalNetEarnings)}</p>
              <p className="text-xs text-gray-500">{isSchool ? 'Priskaičiuotas mokytojų atlygis' : staffShareLabel}</p>
            </div>
          </div>
            </>
          ) : null}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalSessions}</p>
              <p className="text-xs text-gray-500">{t('compStats.lessonsCompleted')}</p>
            </div>
          </div>
          {!showFinanceTotals || isSchool ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalCancelled}</p>
              <p className="text-xs text-gray-500">{t('compStats.cancellations')}</p>
            </div>
          </div>
          ) : null}
        </div>

        {/* Highlights */}
        {!isSchool && tutorStats.length > 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {showFinanceTotals && topEarner && topEarner.earnings > 0 && (
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-amber-200 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider">{t('compStats.topEarner')}</p>
                  <p className="font-bold text-gray-900 mt-0.5">{topEarner.full_name}</p>
                  <p className="text-sm text-amber-700">{fmt(topEarner.earnings)}</p>
                </div>
              </div>
            )}

            {mostCancellations && mostCancellationsCount > 0 && (
              <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-red-200 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-700" />
                </div>
                <div>
                  <p className="text-xs text-red-700 font-semibold uppercase tracking-wider">{t('compStats.mostCancellations')}</p>
                  <p className="font-bold text-gray-900 mt-0.5">{mostCancellations.full_name}</p>
                  <p className="text-sm text-red-700">{t('compStats.cancelledCount', { count: mostCancellationsCount })}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Per-tutor table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">{t('compStats.tutorsHeading')}</h2>
          </div>
          {tutorStats.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">{t('compStats.dataEmpty')}</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {tutorStats.map((stat, idx) => (
                  <div key={stat.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {showFinanceTotals && idx === 0 && stat.earnings > 0 && (
                            <Award className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          )}
                          <p className="font-semibold text-gray-900 truncate">{stat.full_name}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {t('compStats.lessonsColon')}{' '}
                          <span className="font-semibold text-gray-800">{stat.completedSessions}</span>
                          {stat.totalCancelled > 0 ? (
                            <>
                              {' '}· {t('compStats.cancellationsColon')}{' '}
                              <span className="font-semibold text-gray-800">{cancellationBreakdown(stat)}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      {showFinanceTotals ? (
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{fmt(isSchool ? stat.netEarnings : stat.earnings)}</p>
                        {!isSchool ? <p className="text-[11px] text-amber-700">
                          {t('compStats.companyAmount', { amount: stat.companyCommission.toFixed(2) })}
                        </p> : null}
                        <p className="text-[11px] text-green-700">
                          {t('compStats.tutorAmount', { amount: stat.netEarnings.toFixed(2) })}
                        </p>
                      </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="text-left px-5 py-3">{t('compStats.tutorNameColumn')}</th>
                    <th className="text-right px-5 py-3">{t('compStats.lessons')}</th>
                    {showFinanceTotals ? (
                      <>
                    {!isSchool ? <th className="text-right px-5 py-3">{t('compStats.totalRevenue')}</th> : null}
                    {!isSchool ? <th className="text-right px-5 py-3">{t('compStats.companyShare')}</th> : null}
                    <th className="text-right px-5 py-3">{t('compStats.tutorColumn')}</th>
                      </>
                    ) : null}
                    <th className="text-right px-5 py-3">{t('compStats.cancellations')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tutorStats.map((stat, idx) => (
                    <tr key={stat.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {showFinanceTotals && idx === 0 && stat.earnings > 0 && (
                            <Award className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          )}
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-indigo-700">
                              {stat.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900">{stat.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">{stat.completedSessions}</td>
                      {showFinanceTotals ? (
                        <>
                      {!isSchool ? <td className="px-5 py-3 text-right font-semibold text-gray-700">{fmt(stat.earnings)}</td> : null}
                      {!isSchool ? <td className="px-5 py-3 text-right font-semibold text-amber-700">
                        {fmt(stat.companyCommission)}
                      </td> : null}
                      <td className="px-5 py-3 text-right font-semibold text-green-700">{fmt(stat.netEarnings)}</td>
                        </>
                      ) : null}
                      <td className="px-5 py-3 text-right text-sm text-gray-500">
                        {cancellationBreakdown(stat)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SchoolActivityStatsView({
  activity,
  tutorStats,
  filterStartDate,
  filterEndDate,
  onStartDateChange,
  onEndDateChange,
  onApplyRange,
  onClear,
}: {
  activity: SchoolActivitySummary;
  tutorStats: TutorStat[];
  filterStartDate: Date | null;
  filterEndDate: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
  onApplyRange: (start: Date, end: Date) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const cards = [
    {
      label: t('schoolStats.scheduled'),
      value: activity.scheduled,
      sub: t('schoolStats.meetingsOnce'),
      icon: CalendarClock,
      tone: 'bg-indigo-100 text-indigo-700',
    },
    {
      label: t('schoolStats.completed'),
      value: activity.completed,
      sub: t('schoolStats.confirmedHeld'),
      icon: CheckCircle2,
      tone: 'bg-emerald-100 text-emerald-700',
    },
    {
      label: t('schoolStats.attendance'),
      value: activity.attendanceRate === null ? '–' : `${activity.attendanceRate}%`,
      sub: t('schoolStats.confirmedRatio', {
        attended: activity.attendedStudents,
        confirmed: activity.confirmedAttendance,
      }),
      icon: UserCheck,
      tone: 'bg-cyan-100 text-cyan-700',
    },
    {
      label: t('schoolStats.absentChildren'),
      value: activity.absentStudents,
      sub: t('schoolStats.childRecords'),
      icon: UserX,
      tone: 'bg-rose-100 text-rose-700',
    },
    {
      label: t('schoolStats.cancelled'),
      value: activity.cancelled,
      sub: t('schoolStats.meetingsOnce'),
      icon: AlertTriangle,
      tone: 'bg-gray-100 text-gray-700',
    },
    {
      label: t('schoolStats.unconfirmed'),
      value: activity.unconfirmedStudents,
      sub: t('schoolStats.reviewAttendance'),
      icon: CircleAlert,
      tone: 'bg-amber-100 text-amber-700',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 sm:px-0">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('compStats.pageTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('schoolStats.subtitle')}</p>
      </header>

      <DateRangeFilter
        className="space-y-3 border-gray-100 bg-white/80 p-4 shadow-sm sm:p-5"
        startDate={filterStartDate}
        endDate={filterEndDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onApplyRange={onApplyRange}
        onSearch={() => {
          if (filterStartDate && filterEndDate) onApplyRange(filterStartDate, filterEndDate);
        }}
        onClear={onClear}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, sub, icon: Icon, tone }) => (
          <div key={label} className="flex min-w-0 items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs font-medium leading-4 text-gray-600">{label}</p>
              <p className="mt-0.5 text-xs leading-4 text-gray-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-blue-900">
        {t('schoolStats.methodExplanation')}
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">{t('schoolStats.byTeacher')}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t('schoolStats.byTeacherHint')}</p>
        </div>
        {tutorStats.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">{t('compStats.dataEmpty')}</div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 md:hidden">
              {tutorStats.map(stat => (
                <div key={stat.id} className="space-y-3 p-4">
                  <p className="font-semibold text-gray-900">{stat.full_name}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <SchoolTeacherMetric label={t('schoolStats.scheduledShort')} value={stat.scheduledSessions} />
                    <SchoolTeacherMetric label={t('schoolStats.completedShort')} value={stat.completedSessions} />
                    <SchoolTeacherMetric label={t('schoolStats.attendanceShort')} value={stat.attendanceRate === null ? '–' : `${stat.attendanceRate}%`} />
                    <SchoolTeacherMetric label={t('schoolStats.absentShort')} value={stat.attendanceAbsent} tone="text-rose-700" />
                    <SchoolTeacherMetric label={t('schoolStats.cancelledShort')} value={stat.totalCancelled} />
                    <SchoolTeacherMetric label={t('schoolStats.unconfirmedShort')} value={stat.attendanceUnconfirmed} tone="text-amber-700" />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-3 text-left">{t('role.staffSchool')}</th>
                    <th className="px-4 py-3 text-right">{t('schoolStats.scheduledShort')}</th>
                    <th className="px-4 py-3 text-right">{t('schoolStats.completedShort')}</th>
                    <th className="px-4 py-3 text-right">{t('schoolStats.attendanceShort')}</th>
                    <th className="px-4 py-3 text-right">{t('schoolStats.absentShort')}</th>
                    <th className="px-4 py-3 text-right">{t('schoolStats.cancelledShort')}</th>
                    <th className="px-5 py-3 text-right">{t('schoolStats.unconfirmedShort')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tutorStats.map(stat => (
                    <tr key={stat.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3 font-medium text-gray-900">{stat.full_name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{stat.scheduledSessions}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{stat.completedSessions}</td>
                      <td className="px-4 py-3 text-right font-semibold text-cyan-700">
                        {stat.attendanceRate === null ? '–' : `${stat.attendanceRate}%`}
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          ({stat.attendanceJoined}/{stat.attendanceJoined + stat.attendanceAbsent})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-700">{stat.attendanceAbsent}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{stat.totalCancelled}</td>
                      <td className="px-5 py-3 text-right font-semibold text-amber-700">{stat.attendanceUnconfirmed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SchoolTeacherMetric({
  label,
  value,
  tone = 'text-gray-900',
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-2">
      <p className={`font-semibold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">{label}</p>
    </div>
  );
}
