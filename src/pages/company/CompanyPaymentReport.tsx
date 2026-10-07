import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { filterPaymentReport, paymentReportDay, validPaymentReportPeriod,
  type PaymentReportData, type PaymentReportFilters, type PaymentReportRow } from '@/lib/companyPaymentReport';
import { downloadPaymentReport, paymentReportCsv, paymentReportXlsx } from '@/lib/companyPaymentReportExport';

const PAGE_SIZE = 50;
const SELECT_CLASS = 'h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm focus:ring-2 focus:ring-indigo-500';
const STATUS_CLASS = {
  paid: 'bg-emerald-50 text-emerald-700', issued: 'bg-amber-50 text-amber-800', pending: 'bg-amber-50 text-amber-800',
  cancelled: 'bg-gray-100 text-gray-600', refunded: 'bg-purple-50 text-purple-700',
};

export default function CompanyPaymentReport() {
  const { t } = useTranslation();
  const [data, setData] = useState<PaymentReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<PaymentReportFilters>(() => {
    const today = paymentReportDay(new Date().toISOString())!;
    return { start: `${today.slice(0, 7)}-01`, end: today, dateBasis: 'issued', type: 'all', status: 'all', tutorId: '', search: '' };
  });
  const updateFilter = <K extends keyof PaymentReportFilters>(key: K, value: PaymentReportFilters[K]) => {
    setFilters(previous => ({ ...previous, [key]: value }));
    setPage(0);
  };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    (async () => {
      try {
        const headers = await authHeaders();
        if (controller.signal.aborted) return;
        const response = await fetch('/api/company-payment-report', { headers, signal: controller.signal });
        if (!response.ok) throw new Error('Payment report unavailable');
        const report = await response.json() as PaymentReportData;
        if (!Array.isArray(report.rows)) throw new Error('Invalid payment report');
        if (!controller.signal.aborted) {
          setData(report);
          setPage(0);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refresh]);
  const periodValid = validPaymentReportPeriod(filters.start, filters.end);
  const rows = useMemo(() => filterPaymentReport(data?.rows || [], filters), [data, filters]);
  const tutors = useMemo(() => [...new Map((data?.rows || []).flatMap(row => row.tutors).map(tutor => [tutor.id, tutor])).values()]
    .sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const moneyLabel = useCallback((amount: number, currency: string) => `${amount.toFixed(2)} ${currency}`, []);
  const totalLabel = (statuses: PaymentReportRow['status'][]) => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (statuses.includes(row.status)) totals.set(row.currency, (totals.get(row.currency) || 0) + row.amount);
    }
    return [...totals].map(([currency, amount]) => moneyLabel(amount, currency)).join(' / ') || '—';
  };
  const exportRows = async (type: 'csv' | 'xlsx') => {
    setExporting(true);
    setExportError(false);
    // Export every matching record, including rows beyond the visible table page.
    const filename = `payments_${filters.dateBasis}_${filters.start || 'all'}_${filters.end || 'all'}`;
    try {
      if (type === 'csv') downloadPaymentReport(paymentReportCsv(rows, t), type, filename);
      else {
        downloadPaymentReport(await paymentReportXlsx(rows, t), type, filename);
      }
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };
  const dateLabel = (value: string | null) => paymentReportDay(value) || '—';
  const unavailableExport = loading || error || exporting || !periodValid || !rows.length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('companyPaymentReport.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('companyPaymentReport.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRefresh(value => value + 1)} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />{t('companyPaymentReport.refresh')}
          </Button>
          <Button variant="outline" disabled={unavailableExport} onClick={() => void exportRows('csv')}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
          <Button disabled={unavailableExport} onClick={() => void exportRows('xlsx')}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Excel
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="payments-date-basis">{t('companyPaymentReport.dateBasis')}</Label>
            <select id="payments-date-basis" className={SELECT_CLASS} value={filters.dateBasis}
              onChange={event => updateFilter('dateBasis', event.target.value as PaymentReportFilters['dateBasis'])}>
              <option value="issued">{t('companyPaymentReport.byIssued')}</option>
              <option value="paid">{t('companyPaymentReport.byPaid')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payments-start">{t('companyPaymentReport.start')}</Label>
            <DateInput id="payments-start" value={filters.start} onChange={event => updateFilter('start', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payments-end">{t('companyPaymentReport.end')}</Label>
            <DateInput id="payments-end" value={filters.end} onChange={event => updateFilter('end', event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => { setFilters(previous => ({ ...previous, start: '', end: '' })); setPage(0); }}>
              {t('companyPaymentReport.allTime')}
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="payments-search">{t('companyPaymentReport.search')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input id="payments-search" className="pl-9" value={filters.search} onChange={event => updateFilter('search', event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payments-type">{t('companyPaymentReport.type')}</Label>
            <select id="payments-type" className={SELECT_CLASS} value={filters.type} onChange={event => updateFilter('type', event.target.value as PaymentReportFilters['type'])}>
              <option value="all">{t('companyPaymentReport.all')}</option>
              {(['trial', 'package', 'lesson', 'mixed', 'other'] as const).map(type => <option key={type} value={type}>{t(`companyPaymentReport.type.${type}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payments-status">{t('companyPaymentReport.status')}</Label>
            <select id="payments-status" className={SELECT_CLASS} value={filters.status} onChange={event => updateFilter('status', event.target.value as PaymentReportFilters['status'])}>
              <option value="all">{t('companyPaymentReport.all')}</option>
              {(['issued', 'pending', 'paid', 'cancelled', 'refunded'] as const).map(status => <option key={status} value={status}>{t(`companyPaymentReport.status.${status}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payments-tutor">{t('companyPaymentReport.tutor')}</Label>
            <select id="payments-tutor" className={SELECT_CLASS} value={filters.tutorId} onChange={event => updateFilter('tutorId', event.target.value)}>
              <option value="">{t('companyPaymentReport.all')}</option>
              {tutors.map(tutor => <option key={tutor.id} value={tutor.id}>{tutor.name || '—'}</option>)}
            </select>
          </div>
        </div>
        {!periodValid && <p role="alert" className="text-sm text-red-600">{t('companyPaymentReport.invalidPeriod')}</p>}
        <p className="text-xs text-gray-500">{t('companyPaymentReport.historyNote')}</p>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-red-700">{t('companyPaymentReport.loadError')}</p>
          <Button variant="outline" className="mt-3" onClick={() => setRefresh(value => value + 1)}>{t('companyPaymentReport.retry')}</Button>
        </div>
      ) : loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-20 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />{t('companyPaymentReport.loading')}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[['records', String(rows.length)], ['paidTotal', totalLabel(['paid'])], ['outstandingTotal', totalLabel(['issued', 'pending'])]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">{t(`companyPaymentReport.${label}`)}</p><p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
          {data?.rows.some(row => row.status === 'paid' && !row.paidAt) && <p className="text-sm text-gray-500">{t('companyPaymentReport.missingDates')}</p>}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[1450px] text-sm">
              <caption className="sr-only">{t('companyPaymentReport.title')}</caption>
              <thead className="bg-gray-50 text-left text-xs text-gray-600">
                <tr>{['invoiceNumber', 'student', 'payerName', 'tutor', 'type', 'packageLessons', 'amount', 'issueDate', 'paidAt', 'status'].map(key => (
                  <th key={key} scope="col" className="px-4 py-3 font-medium">{t(`companyPaymentReport.${key}`)}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map(row => (
                  <tr key={row.id} className="align-top hover:bg-gray-50/50">
                    <td className="px-4 py-4 font-medium whitespace-nowrap">{row.invoiceNumber || '—'}</td>
                    <td className="px-4 py-4 min-w-64 space-y-3">
                      {row.students.length ? row.students.map(student => (
                        <div key={student.id}>
                          <p className="font-medium">{student.name || '—'}</p>
                          <p className="mt-1 text-xs text-gray-500">{t('companyPaymentReport.firstLesson')}: {dateLabel(student.firstLessonAt)}</p>
                          <p className="text-xs text-gray-500">{t('companyPaymentReport.completedLessons')}: {student.completedLessons}</p>
                          <details className="mt-1 text-xs text-gray-500">
                            <summary className="cursor-pointer text-indigo-600">{t('companyPaymentReport.studentHistory')}</summary>
                            <p className="mt-1">{t('companyPaymentReport.trialPaid')}: {t(student.trialPaid ? 'common.yes' : 'common.no')} {student.trialPaid ? dateLabel(student.trialPaidAt) : ''}</p>
                            <p>{t('companyPaymentReport.firstPackagePaidAt')}: {student.firstPackagePurchased ? dateLabel(student.firstPackagePaidAt) : t('common.no')}</p>
                            <p>{t('companyPaymentReport.cancelledLessons')}: {student.cancelledLessons}</p>
                            <p>{t('companyPaymentReport.noShowLessons')}: {student.noShowLessons}</p>
                          </details>
                        </div>
                      )) : <span className="text-gray-400">{t('companyPaymentReport.unlinkedStudent')}</span>}
                    </td>
                    <td className="px-4 py-4 min-w-56"><p>{row.payerName || '—'}</p><p className="mt-1 break-all text-xs text-gray-500">{row.payerEmail || '—'}</p><p className="text-xs text-gray-500">{row.payerPhone || '—'}</p></td>
                    <td className="px-4 py-4">{row.tutors.map(tutor => tutor.name || '—').join(', ') || '—'}</td>
                    <td className="px-4 py-4">{t(`companyPaymentReport.type.${row.type}`)}</td>
                    <td className="px-4 py-4 tabular-nums">{row.packageLessons ?? '—'}</td>
                    <td className="px-4 py-4 font-medium tabular-nums whitespace-nowrap">{moneyLabel(row.amount, row.currency)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{dateLabel(row.issueDate)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{dateLabel(row.paidAt)}</td>
                    <td className="px-4 py-4"><span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap', STATUS_CLASS[row.status])}>{t(`companyPaymentReport.status.${row.status}`)}</span></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">{t('companyPaymentReport.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
            <span>{rows.length ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, rows.length)} / ${rows.length}` : '0'}</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage(value => value - 1)}>{t('companyPaymentReport.previous')}</Button>
              <Button variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>{t('companyPaymentReport.next')}</Button>
            </div>
          </div>
        </>
      )}
      {exportError && <p role="alert" className="text-sm text-red-600">{t('companyPaymentReport.exportError')}</p>}
    </div>
  );
}
