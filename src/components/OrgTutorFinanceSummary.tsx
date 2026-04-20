import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import {
  Euro,
  TrendingUp,
  CalendarRange,
  FileText,
  Plus,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import InvoiceSettingsForm from '@/components/InvoiceSettingsForm';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';
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

const MAX_RANGE_DAYS = 45;

function daysInRangeInclusive(start: Date, end: Date): number {
  return differenceInCalendarDays(end, start) + 1;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  period_start: string | null;
  period_end: string | null;
  buyer_snapshot: { name: string; email?: string };
  total_amount: number;
  status: 'issued' | 'paid' | 'cancelled';
  grouping_type: string;
  pdf_storage_path: string | null;
  created_at: string;
}

export default function OrgTutorFinanceSummary() {
  const { t, dateFnsLocale } = useTranslation();
  const { payPerLessonEur, loading: policyLoading } = useOrgTutorPolicy();

  const [periodMode, setPeriodMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [rangeStart, setRangeStart] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
          setRangeError(t('orgFinance.startDateAfterEnd'));
          setCompletedCount(0);
          setLoading(false);
          return;
        }
        const span = daysInRangeInclusive(a, b);
        if (span > MAX_RANGE_DAYS) {
          setRangeError(t('orgFinance.periodTooLong', { days: MAX_RANGE_DAYS }));
          setCompletedCount(0);
          setLoading(false);
          return;
        }
        setRangeError(null);
        startIso = a.toISOString();
        endIso = b.toISOString();
      }

      const { count, error } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', user.id)
        .eq('status', 'completed')
        .gte('start_time', startIso)
        .lte('start_time', endIso);

      if (cancelled) return;
      if (error) {
        console.error('[OrgTutorFinanceSummary]', error);
        setCompletedCount(0);
      } else {
        setCompletedCount(count ?? 0);
      }
      setLoading(false);
    };

    if (!policyLoading) void load();

    return () => {
      cancelled = true;
    };
  }, [month, periodMode, rangeStart, rangeEnd, policyLoading]);

  const fetchInvoices = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setInvoicesLoading(true);

    let query = supabase
      .from('invoices')
      .select('*')
      .eq('issued_by_user_id', user.id)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[OrgTutorFinanceSummary] invoices fetch:', error);
    } else {
      setInvoices((data || []) as Invoice[]);
    }
    setInvoicesLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDownloadPdf = async (invoiceId: string) => {
    setDownloadingId(invoiceId);
    try {
      const res = await fetch(`/api/invoice-pdf?id=${invoiceId}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to download PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[OrgTutorFinanceSummary] download:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleStatusChange = async (invoiceId: string, newStatus: 'paid' | 'cancelled') => {
    const { error } = await supabase
      .from('invoices')
      .update({ status: newStatus })
      .eq('id', invoiceId);

    if (!error) {
      setInvoices(prev =>
        prev.map(inv => inv.id === invoiceId ? { ...inv, status: newStatus } : inv)
      );
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      issued: 'bg-blue-100 text-blue-700',
      paid: 'bg-green-100 text-green-700',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    const labels: Record<string, string> = {
      issued: t('invoices.statusIssued'),
      paid: t('invoices.statusPaid'),
      cancelled: t('invoices.statusCancelled'),
    };
    return (
      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', styles[status] || styles.issued)}>
        {labels[status] || status}
      </span>
    );
  };

  const gross = completedCount * payPerLessonEur;

  return (
    <div className="space-y-6">
      {/* Earnings summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('orgFinance.yourPay')}</h2>
            <p className="text-xs text-gray-500">
              {t('orgFinance.fixedPayPerLesson', { amount: payPerLessonEur.toFixed(2) })}
            </p>
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
              {t('orgFinance.calendarMonth')}
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
              {t('orgFinance.dateRange', { days: MAX_RANGE_DAYS })}
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

        {loading || policyLoading ? (
          <p className="text-gray-500 text-sm mt-6">{t('common.loadingDots')}</p>
        ) : (
          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 p-4">
            <p className="text-sm text-gray-600">
              {t('orgFinance.completedLessons', { range: rangeLabel })}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{completedCount}</p>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
              <Euro className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{t('orgFinance.approxInvoiceAmount')}</p>
                <p className="text-xl font-bold text-emerald-700">{gross.toFixed(2)} €</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {t('orgFinance.summaryNote')}
            </p>
          </div>
        )}
      </div>

      {/* Invoices section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            {t('invoices.title')}
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-xl gap-1"
            >
              <Settings className="w-4 h-4" />
              {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              {t('orgFinance.issueSF')}
            </Button>
          </div>
        </div>

        {showSettings && (
          <div className="mb-4 border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('invoices.settingsTitle')}</h3>
            <InvoiceSettingsForm
              scope="user"
              allowedEntityTypes={['verslo_liudijimas', 'individuali_veikla']}
              onSaved={() => setShowSettings(false)}
            />
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            {['all', 'issued', 'paid', 'cancelled'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  statusFilter === status
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                )}
              >
                {status === 'all' ? t('invoices.filterAll') : t(`invoices.status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>

        {invoicesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{t('invoices.empty')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('invoices.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{inv.invoice_number}</span>
                      {statusBadge(inv.status)}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {(inv.buyer_snapshot as any)?.name || '-'} {' \u00B7 '}
                      {format(new Date(inv.issue_date), 'yyyy-MM-dd')} {' \u00B7 '}
                      {'\u20AC'}{Number(inv.total_amount).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadPdf(inv.id)}
                    disabled={downloadingId === inv.id}
                    className="rounded-lg"
                    title={t('invoices.downloadPdf')}
                  >
                    {downloadingId === inv.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </Button>
                  {inv.status === 'issued' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStatusChange(inv.id, 'paid')}
                        className="rounded-lg text-green-600 hover:text-green-700 hover:bg-green-50"
                        title={t('invoices.markPaid')}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStatusChange(inv.id, 'cancelled')}
                        className="rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                        title={t('invoices.markCancelled')}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        isOrgTutor
        onSuccess={() => {
          setIsCreateOpen(false);
          fetchInvoices();
        }}
      />
    </div>
  );
}
