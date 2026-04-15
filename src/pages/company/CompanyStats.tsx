import { useEffect, useState } from 'react';
import CompanyLayout from '@/components/CompanyLayout';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { TrendingUp, Award, AlertTriangle, Wallet, BookOpen } from 'lucide-react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { useTranslation } from '@/lib/i18n';

interface TutorStat {
  id: string;
  full_name: string;
  completedSessions: number;
  cancelledByTutor: number;
  cancelledByStudent: number;
  totalCancelled: number;
  earnings: number;
  companyCommission: number;
  netEarnings: number;
}

const STATS_CACHE_KEY = 'company_stats';

export default function CompanyStats() {
  const { t } = useTranslation();
  const stCache = getCached<any>(STATS_CACHE_KEY);
  const [loading, setLoading] = useState(!stCache);
  const [tutorStats, setTutorStats] = useState<TutorStat[]>(stCache?.tutorStats ?? []);
  const [totalEarnings, setTotalEarnings] = useState(stCache?.totalEarnings ?? 0);
  const [totalCompanyCommission, setTotalCompanyCommission] = useState(stCache?.totalCompanyCommission ?? 0);
  const [totalNetEarnings, setTotalNetEarnings] = useState(stCache?.totalNetEarnings ?? 0);
  const [totalSessions, setTotalSessions] = useState(stCache?.totalSessions ?? 0);
  const [totalCancelled, setTotalCancelled] = useState(stCache?.totalCancelled ?? 0);
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);

  useEffect(() => {
    if (isFilterActive || !getCached(STATS_CACHE_KEY)) loadData();
  }, [filterStartDate, filterEndDate, isFilterActive]);

  const loadData = async () => {
    if (!getCached(STATS_CACHE_KEY)) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!adminRow) return;

    // Load all profiles in org
    const { data: tutorData } = await supabase
      .from('profiles')
      .select('id, full_name, company_commission_percent')
      .eq('organization_id', adminRow.organization_id);

    // Exclude organization admins from tutor stats (they are managers, not tutors)
    const { data: adminUsers } = await supabase
      .from('organization_admins')
      .select('user_id')
      .eq('organization_id', adminRow.organization_id);
    const adminIds = new Set((adminUsers || []).map((a: any) => a.user_id));

    const tutorList = (tutorData || []).filter(t => !adminIds.has(t.id));

    if (tutorList.length === 0) { setLoading(false); return; }

    const tutorIds = tutorList.map(t => t.id);

    let query = supabase
      .from('sessions')
      .select('tutor_id, status, payment_status, price, cancelled_by')
      .in('tutor_id', tutorIds);

    if (isFilterActive) {
      if (filterStartDate) {
        const start = new Date(filterStartDate);
        start.setHours(0, 0, 0, 0);
        query = query.gte('start_time', start.toISOString());
      }
      if (filterEndDate) {
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte('start_time', end.toISOString());
      }
    } else {
      // Default to last year for performance if no explicit date filter is selected
      // (keeps previous behavior while still allowing full flexible date ranges).
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      query = query.gte('start_time', oneYearAgo.toISOString());
    }

    // OPTIMIZED: Add limit for safety
    const { data: sessions } = await query.limit(10000);
    const allSessions = sessions || [];

    // Include paid lesson packages (including trial packages) so manual confirmations
    // are reflected in stats immediately, not only after lessons are conducted.
    let packagesQuery = supabase
      .from('lesson_packages')
      .select('tutor_id, total_price, total_lessons, paid_at')
      .in('tutor_id', tutorIds)
      .eq('paid', true)
      .not('paid_at', 'is', null);

    if (isFilterActive) {
      if (filterStartDate) {
        const start = new Date(filterStartDate);
        start.setHours(0, 0, 0, 0);
        packagesQuery = packagesQuery.gte('paid_at', start.toISOString());
      }
      if (filterEndDate) {
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        packagesQuery = packagesQuery.lte('paid_at', end.toISOString());
      }
    } else {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      packagesQuery = packagesQuery.gte('paid_at', oneYearAgo.toISOString());
    }

    const { data: paidPackages } = await packagesQuery.limit(10000);
    const allPaidPackages = paidPackages || [];

    const stats: TutorStat[] = tutorList.map(tutor => {
      const tutorSessions = allSessions.filter(s => s.tutor_id === tutor.id);
      // Count paid: Stripe paid, confirmed, or status=completed
      const paid = tutorSessions.filter(s =>
        s.status === 'completed' || ['paid', 'confirmed'].includes((s as any).payment_status)
      );
      const tutorPaidPackages = allPaidPackages.filter((p: any) => p.tutor_id === tutor.id);
      const cancelledByTutor = tutorSessions.filter(s => s.status === 'cancelled' && (s as any).cancelled_by === 'tutor');
      const cancelledByStudent = tutorSessions.filter(s => s.status === 'cancelled' && (s as any).cancelled_by === 'student');
      const totalCancelledCount = tutorSessions.filter(s => s.status === 'cancelled').length;
      const sessionsEarnings = paid.reduce((sum, s) => sum + (s.price || 0), 0);
      const packagesEarnings = tutorPaidPackages.reduce((sum: number, p: any) => sum + Number(p.total_price || 0), 0);
      const earnings = sessionsEarnings + packagesEarnings;
      // company_commission_percent now stores fixed tutor pay amount (€), not a percentage
      const tutorPayPerSession = (tutor as any).company_commission_percent || 0;
      const packageLessons = tutorPaidPackages.reduce((sum: number, p: any) => sum + Number(p.total_lessons || 0), 0);
      const netEarnings = tutorPayPerSession * (paid.length + packageLessons);
      const companyCommission = earnings - netEarnings;

      return {
        id: tutor.id,
        full_name: tutor.full_name,
        completedSessions: paid.length,
        cancelledByTutor: cancelledByTutor.length,
        cancelledByStudent: cancelledByStudent.length,
        totalCancelled: totalCancelledCount,
        earnings,
        companyCommission,
        netEarnings,
      };
    });

    const sorted = stats.sort((a, b) => b.earnings - a.earnings);
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

    if (!isFilterActive) {
      setCache(STATS_CACHE_KEY, {
        tutorStats: sorted, totalEarnings: te, totalCompanyCommission: tcc,
        totalNetEarnings: tne, totalSessions: ts, totalCancelled: tcn,
      });
    }
    setLoading(false);
  };

  const topEarner = tutorStats[0];
  const mostCancellations = [...tutorStats].sort((a, b) => b.totalCancelled - a.totalCancelled)[0];

  if (loading) {
    return (
      <CompanyLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </CompanyLayout>
    );
  }

  return (
    <CompanyLayout>
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
            onSearch={() => setIsFilterActive(true)}
            onClear={() => {
              setFilterStartDate(null);
              setFilterEndDate(null);
              setIsFilterActive(false);
            }}
          />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalEarnings.toFixed(2)} €</p>
              <p className="text-xs text-gray-500">{t('compStats.totalRevenue')}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">{totalCompanyCommission.toFixed(2)} €</p>
              <p className="text-xs text-gray-500">{t('compStats.companyShare')}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-900">{totalNetEarnings.toFixed(2)} €</p>
              <p className="text-xs text-gray-500">{t('compStats.tutorShare')}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalSessions}</p>
              <p className="text-xs text-gray-500">{t('compStats.lessonsCompleted')}</p>
            </div>
          </div>
        </div>

        {/* Highlights */}
        {tutorStats.length > 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {topEarner && topEarner.earnings > 0 && (
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-amber-200 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider">{t('compStats.topEarner')}</p>
                  <p className="font-bold text-gray-900 mt-0.5">{topEarner.full_name}</p>
                  <p className="text-sm text-amber-700">{topEarner.earnings.toFixed(2)} €</p>
                </div>
              </div>
            )}

            {mostCancellations && mostCancellations.totalCancelled > 0 && (
              <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-red-200 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-700" />
                </div>
                <div>
                  <p className="text-xs text-red-700 font-semibold uppercase tracking-wider">{t('compStats.mostCancellations')}</p>
                  <p className="font-bold text-gray-900 mt-0.5">{mostCancellations.full_name}</p>
                  <p className="text-sm text-red-700">{t('compStats.cancelledCount', { count: mostCancellations.totalCancelled })}</p>
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
                          {idx === 0 && stat.earnings > 0 && (
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
                              <span className="font-semibold text-gray-800">{stat.totalCancelled}</span>
                              <span className="text-gray-400">{` (K:${stat.cancelledByTutor} M:${stat.cancelledByStudent})`}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{stat.earnings.toFixed(2)} €</p>
                        <p className="text-[11px] text-amber-700">
                          {t('compStats.companyAmount', { amount: stat.companyCommission.toFixed(2) })}
                        </p>
                        <p className="text-[11px] text-green-700">
                          {t('compStats.tutorAmount', { amount: stat.netEarnings.toFixed(2) })}
                        </p>
                      </div>
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
                    <th className="text-right px-5 py-3">{t('compStats.totalRevenue')}</th>
                    <th className="text-right px-5 py-3">{t('compStats.companyShare')}</th>
                    <th className="text-right px-5 py-3">{t('compStats.tutorColumn')}</th>
                    <th className="text-right px-5 py-3">{t('compStats.cancellations')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tutorStats.map((stat, idx) => (
                    <tr key={stat.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {idx === 0 && stat.earnings > 0 && (
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
                      <td className="px-5 py-3 text-right font-semibold text-gray-700">{stat.earnings.toFixed(2)} €</td>
                      <td className="px-5 py-3 text-right font-semibold text-amber-700">
                        {stat.companyCommission.toFixed(2)} €
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-green-700">{stat.netEarnings.toFixed(2)} €</td>
                      <td className="px-5 py-3 text-right text-sm text-gray-500">
                        {stat.totalCancelled > 0 ? `${stat.totalCancelled} (K:${stat.cancelledByTutor} M:${stat.cancelledByStudent})` : '—'}
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
    </CompanyLayout>
  );
}
