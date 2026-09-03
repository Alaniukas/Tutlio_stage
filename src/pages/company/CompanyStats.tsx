import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { companyStatsCacheKey, getCached, setCache } from '@/lib/dataCache';
import { TrendingUp, Award, AlertTriangle, Wallet, BookOpen } from 'lucide-react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
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

interface TutorStat {
  id: string;
  full_name: string;
  completedSessions: number;
  cancelledByTutor: number;
  cancelledByStudent: number;
  cancelledByAdmin: number;
  totalCancelled: number;
  earnings: number;
  companyCommission: number;
  netEarnings: number;
}

export default function CompanyStats() {
  const { t } = useTranslation();
  const cancellationBreakdown = (
    stat: Pick<TutorStat, 'totalCancelled' | 'cancelledByTutor' | 'cancelledByStudent' | 'cancelledByAdmin'>,
  ) =>
    formatCancellationBreakdown(stat, (role, count) => {
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
  const [loading, setLoading] = useState(!stCache);
  const [tutorStats, setTutorStats] = useState<TutorStat[]>(stCache?.tutorStats ?? []);
  const [totalEarnings, setTotalEarnings] = useState(stCache?.totalEarnings ?? 0);
  const [totalCompanyCommission, setTotalCompanyCommission] = useState(stCache?.totalCompanyCommission ?? 0);
  const [totalNetEarnings, setTotalNetEarnings] = useState(stCache?.totalNetEarnings ?? 0);
  const [totalSessions, setTotalSessions] = useState(stCache?.totalSessions ?? 0);
  const [totalCancelled, setTotalCancelled] = useState(stCache?.totalCancelled ?? 0);
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const effectiveRange = appliedRange ?? defaultStatsDateRange();
  const rangeKey = statsDateRangeKey(effectiveRange);

  useEffect(() => {
    loadData(effectiveRange, !appliedRange);
  }, [rangeKey, showFinanceTotals, appliedRange]);

  const loadData = async (range: { start: Date; end: Date }, cacheResult: boolean) => {
    setLoading(true);
    try {
    const { startIso, endIso } = normalizeStatsDateRange(range.start, range.end);
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

    if (tutorList.length === 0) { setLoading(false); return; }

    const tutorIds = tutorList.map(t => t.id);

    let query = supabase
      .from('sessions')
      .select('tutor_id, status, payment_status, price, cancelled_by, paid, is_complimentary, lesson_package_id, subject_id, subjects(is_trial)')
      .in('tutor_id', tutorIds)
      .gte('start_time', startIso)
      .lte('start_time', endIso);

    const { data: sessions } = await query.limit(3000);
    const allSessions = sessions || [];
    const proKlase = isProKlaseOrg(adminRow.organization_id);
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
      const cancellation = countCancellationAttribution(tutorSessions);
      const tutorPayPerSession = (tutor as any).company_commission_percent || 0;

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
          completedSessions,
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
        completedSessions: countConductedOrgSessions(conducted),
        cancelledByTutor: cancellation.cancelledByTutor,
        cancelledByStudent: cancellation.cancelledByStudent,
        cancelledByAdmin: cancellation.cancelledByAdmin,
        totalCancelled: cancellation.totalCancelled,
        earnings,
        companyCommission,
        netEarnings,
      };
    });

    const sorted = showFinanceTotals
      ? stats.sort((a, b) => b.earnings - a.earnings)
      : stats.sort((a, b) => b.completedSessions - a.completedSessions);
    const te = stats.reduce((sum, s) => sum + s.earnings, 0);
    const tcc = stats.reduce((sum, s) => sum + s.companyCommission, 0);
    const tne = stats.reduce((sum, s) => sum + s.netEarnings, 0);
    const ts = stats.reduce((sum, s) => sum + s.completedSessions, 0);
    const tcn = stats.reduce((sum, s) => sum + s.totalCancelled, 0);

    setTutorStats(sorted);
    setTotalEarnings(te);
    setTotalCompanyCommission(tcc);
    setTotalNetEarnings(tne);
    setTotalSessions(ts);
    setTotalCancelled(tcn);

    if (cacheResult) {
      setCache(companyStatsCacheKey(adminRow.organization_id), {
        tutorStats: sorted, totalEarnings: te, totalCompanyCommission: tcc,
        totalNetEarnings: tne, totalSessions: ts, totalCancelled: tcn,
      });
    }
    } finally {
      setLoading(false);
    }
  };

  const topEarner = showFinanceTotals ? tutorStats[0] : null;
  const mostCancellations = [...tutorStats].sort(
    (a, b) => countUserInitiatedCancellations(b) - countUserInitiatedCancellations(a),
  )[0];
  const mostCancellationsCount = mostCancellations
    ? countUserInitiatedCancellations(mostCancellations)
    : 0;

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
              <p className="text-xs text-gray-500">{t('compStats.totalRevenue')}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">{fmt(totalCompanyCommission)}</p>
              <p className="text-xs text-gray-500">{t('compStats.companyShare')}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-900">{fmt(totalNetEarnings)}</p>
              <p className="text-xs text-gray-500">{t('compStats.tutorShare')}</p>
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
          {!showFinanceTotals ? (
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
        {tutorStats.length > 1 && (
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
                        <p className="text-sm font-semibold text-gray-900">{fmt(stat.earnings)}</p>
                        <p className="text-[11px] text-amber-700">
                          {t('compStats.companyAmount', { amount: stat.companyCommission.toFixed(2) })}
                        </p>
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
                    <th className="text-right px-5 py-3">{t('compStats.totalRevenue')}</th>
                    <th className="text-right px-5 py-3">{t('compStats.companyShare')}</th>
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
                      <td className="px-5 py-3 text-right font-semibold text-gray-700">{fmt(stat.earnings)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-amber-700">
                        {fmt(stat.companyCommission)}
                      </td>
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
