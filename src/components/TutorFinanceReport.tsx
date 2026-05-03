import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Euro,
  TrendingUp,
  CalendarRange,
  BookOpen,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  endOfDay,
  differenceInCalendarDays,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { DateInput } from '@/components/ui/date-input';
import { MonthInput } from '@/components/ui/month-input';
import { useTranslation } from '@/lib/i18n';

const MAX_RANGE_DAYS = 90;

interface SessionRow {
  id: string;
  status: string;
  paid: boolean;
  price: number | null;
  start_time: string;
}

interface Props {
  userId: string;
  /** Extra line under subtitle (e.g. how manual vs Stripe maps to lesson paid flags). */
  supplementalNote?: string;
}

export default function TutorFinanceReport({ userId, supplementalNote }: Props) {
  const { t, dateFnsLocale } = useTranslation();

  const [periodMode, setPeriodMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [rangeStart, setRangeStart] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const rangeLabel = useMemo(() => {
    if (periodMode === 'month') {
      return format(new Date(month + '-01'), 'LLLL yyyy', { locale: dateFnsLocale });
    }
    try {
      const a = parseISO(rangeStart);
      const b = parseISO(rangeEnd);
      return `${format(a, 'yyyy-MM-dd')} — ${format(b, 'yyyy-MM-dd')}`;
    } catch {
      return '—';
    }
  }, [periodMode, month, rangeStart, rangeEnd, dateFnsLocale]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      let startIso: string;
      let endIso: string;

      if (periodMode === 'month') {
        const start = startOfMonth(new Date(month + '-01'));
        const end = endOfMonth(start);
        startIso = start.toISOString();
        endIso = end.toISOString();
        setRangeError(null);
      } else {
        const a = startOfDay(parseISO(rangeStart));
        const b = endOfDay(parseISO(rangeEnd));
        if (a > b) {
          setRangeError(t('financeReport.startAfterEnd'));
          setSessions([]);
          setLoading(false);
          return;
        }
        const span = differenceInCalendarDays(b, a) + 1;
        if (span > MAX_RANGE_DAYS) {
          setRangeError(t('financeReport.periodTooLong', { days: MAX_RANGE_DAYS }));
          setSessions([]);
          setLoading(false);
          return;
        }
        setRangeError(null);
        startIso = a.toISOString();
        endIso = b.toISOString();
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('id, status, paid, price, start_time')
        .eq('tutor_id', userId)
        .in('status', ['completed', 'active', 'cancelled', 'no_show'])
        .gte('start_time', startIso)
        .lte('start_time', endIso);

      if (cancelled) return;
      if (error) {
        console.error('[TutorFinanceReport]', error);
        setSessions([]);
      } else {
        setSessions(data || []);
      }
      setLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, month, periodMode, rangeStart, rangeEnd]);

  const stats = useMemo(() => {
    let completed = 0;
    let active = 0;
    let cancelled = 0;
    let noShow = 0;
    let totalEarned = 0;
    let totalOutstanding = 0;

    for (const s of sessions) {
      const price = s.price ?? 0;
      if (s.status === 'completed') {
        completed++;
        if (s.paid) totalEarned += price;
        else totalOutstanding += price;
      } else if (s.status === 'active') {
        active++;
        if (s.paid) totalEarned += price;
        else totalOutstanding += price;
      } else if (s.status === 'cancelled') {
        cancelled++;
      } else if (s.status === 'no_show') {
        noShow++;
      }
    }

    return { completed, active, cancelled, noShow, totalEarned, totalOutstanding, total: sessions.length };
  }, [sessions]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t('financeReport.title')}</h2>
          <p className="text-xs text-gray-500">{t('financeReport.subtitle')}</p>
          {supplementalNote ? (
            <p className="text-xs text-sky-900/90 mt-2 leading-relaxed bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
              {supplementalNote}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">{t('common.period')}</p>
        <div className="flex rounded-xl border border-gray-200 p-1 bg-gray-50 gap-1">
          <button
            type="button"
            onClick={() => setPeriodMode('month')}
            className={cn(
              'flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors',
              periodMode === 'month' ? 'bg-white shadow text-indigo-700' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {t('financeReport.calendarMonth')}
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode('range')}
            className={cn(
              'flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5',
              periodMode === 'range' ? 'bg-white shadow text-indigo-700' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            <CalendarRange className="w-4 h-4" />
            {t('financeReport.dateRange')}
          </button>
        </div>

        {periodMode === 'month' ? (
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('common.month')}</label>
            <MonthInput
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('common.from')}</label>
              <DateInput
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('common.to')}</label>
              <DateInput
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {rangeError && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{rangeError}</p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-gray-500 font-medium">{rangeLabel}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-emerald-700 font-medium">{t('financeReport.completed')}</span>
              </div>
              <p className="text-xl font-bold text-emerald-800">{stats.completed}</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-blue-700 font-medium">{t('financeReport.upcoming')}</span>
              </div>
              <p className="text-xl font-bold text-blue-800">{stats.active}</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <XCircle className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-600 font-medium">{t('financeReport.cancelled')}</span>
              </div>
              <p className="text-xl font-bold text-gray-700">{stats.cancelled}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-xs text-amber-700 font-medium">{t('financeReport.noShow')}</span>
              </div>
              <p className="text-xl font-bold text-amber-800">{stats.noShow}</p>
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Euro className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{t('financeReport.earned')}</p>
                  <p className="text-xl font-bold text-emerald-700">{stats.totalEarned.toFixed(2)} &euro;</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Euro className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{t('financeReport.outstanding')}</p>
                  <p className="text-xl font-bold text-amber-700">{stats.totalOutstanding.toFixed(2)} &euro;</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
