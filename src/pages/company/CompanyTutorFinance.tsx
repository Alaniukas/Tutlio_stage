import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, endOfDay, endOfMonth, format, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { ChevronRight, Download, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { MonthInput } from '@/components/ui/month-input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProKlaseTutorFinanceDetails from '@/components/ProKlaseTutorFinanceDetails';
import { authHeaders } from '@/lib/apiHelpers';
import { downloadInvoicePdfFile } from '@/lib/downloadInvoicesZip';
import { useTranslation } from '@/lib/i18n';
import { fmtMoney } from '@/lib/marketMoney';
import type { ProKlaseTutorFinanceResponse, TutorPayInvoice } from '@/lib/proKlaseTutorFinance';
import { cn } from '@/lib/utils';

const MAX_RANGE_DAYS = 45;

export default function CompanyTutorFinance() {
  const { t, dateFnsLocale } = useTranslation();
  const { membership, can } = useOrgAdminAccess();
  const organizationId = membership?.organizationId;
  const userId = membership?.userId;
  const allowed = can('finance.view');
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [rangeStart, setRangeStart] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<ProKlaseTutorFinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ key: string; data: ProKlaseTutorFinanceResponse | null; error: boolean } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);

  const period = useMemo(() => {
    const start = mode === 'month' ? startOfMonth(new Date(month + '-01')) : startOfDay(parseISO(rangeStart));
    const end = mode === 'month' ? endOfMonth(start) : endOfDay(parseISO(rangeEnd));
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return { error: 'common.error' };
    if (start > end) return { error: 'orgFinance.startDateAfterEnd' };
    if (differenceInCalendarDays(end, start) + 1 > MAX_RANGE_DAYS) return { error: 'orgFinance.periodTooLong' };
    return { start: start.toISOString(), end: end.toISOString(), label: mode === 'month'
      ? format(start, 'LLLL yyyy', { locale: dateFnsLocale }) : `${rangeStart} - ${rangeEnd}` };
  }, [mode, month, rangeStart, rangeEnd, dateFnsLocale]);
  const startIso = period.start;
  const endIso = period.end;

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    if (!allowed || !organizationId || !startIso || !endIso) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    (async () => {
      try {
        const headers = await authHeaders();
        if (controller.signal.aborted) return;
        const query = new URLSearchParams({ start: startIso, end: endIso });
        const response = await fetch(`/api/company-tutor-finance?${query}`, { headers, signal: controller.signal });
        if (!response.ok) throw new Error('Tutor finance unavailable');
        const result = await response.json() as ProKlaseTutorFinanceResponse;
        if (!Array.isArray(result.tutors)) throw new Error('Invalid tutor finance');
        if (!controller.signal.aborted) setData(result);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [allowed, organizationId, userId, startIso, endIso, refresh]);

  const detailKey = `${organizationId}:${userId}:${selectedId}:${startIso}:${endIso}:${refresh}`;
  useEffect(() => {
    if (!allowed || !organizationId || !selectedId || !startIso || !endIso) return;
    const controller = new AbortController();
    setDetail({ key: detailKey, data: null, error: false });
    setDownloadError(false);
    (async () => {
      try {
        const headers = await authHeaders();
        if (controller.signal.aborted) return;
        const query = new URLSearchParams({ start: startIso, end: endIso, tutorId: selectedId });
        const response = await fetch(`/api/company-tutor-finance?${query}`, { headers, signal: controller.signal });
        if (!response.ok) throw new Error('Tutor finance unavailable');
        const result = await response.json() as ProKlaseTutorFinanceResponse;
        if (result.tutors?.length !== 1 || result.tutors[0].id !== selectedId || !Array.isArray(result.invoices)) {
          throw new Error('Invalid tutor finance');
        }
        if (!controller.signal.aborted) setDetail({ key: detailKey, data: result, error: false });
      } catch {
        if (!controller.signal.aborted) setDetail({ key: detailKey, data: null, error: true });
      }
    })();
    return () => controller.abort();
  }, [allowed, organizationId, selectedId, startIso, endIso, detailKey]);

  const tutors = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (data?.tutors ?? []).filter(tutor => `${tutor.fullName} ${tutor.email ?? ''}`.toLocaleLowerCase().includes(term));
  }, [data, search]);
  const activeDetail = detail?.key === detailKey ? detail : null;
  const selectedTutor = activeDetail?.data?.tutors[0];
  const selectedName = selectedTutor?.fullName ?? data?.tutors.find(tutor => tutor.id === selectedId)?.fullName;
  const downloadPdf = async (invoice: TutorPayInvoice) => {
    setDownloadingId(invoice.id);
    setDownloadError(false);
    try {
      if (!await downloadInvoicePdfFile(invoice, await authHeaders())) throw new Error('PDF unavailable');
    } catch {
      setDownloadError(true);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" />{t('companyNav.tutorFinance')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('orgFinance.licensedTutors')}</p>
        </div>
        <Button variant="outline" onClick={() => setRefresh(value => value + 1)} disabled={loading} className="gap-2">
          <RefreshCw className="w-4 h-4" />{t('orgFinance.refresh')}
        </Button>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['month', 'range'] as const).map(value => (
            <Button key={value} variant={mode === value ? 'default' : 'outline'} aria-pressed={mode === value}
              onClick={() => { setMode(value); setSelectedId(null); }}>
              {t(value === 'month' ? 'orgFinance.calendarMonth' : 'orgFinance.dateRange')}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {mode === 'month' ? <div className="w-56 space-y-1">
            <Label htmlFor="tutor-finance-month">{t('common.month')}</Label>
            <MonthInput id="tutor-finance-month" value={month} onChange={event => setMonth(event.target.value)} />
          </div> : <>
            <div className="w-48 space-y-1"><Label htmlFor="tutor-finance-start">{t('common.from')}</Label>
              <DateInput id="tutor-finance-start" value={rangeStart} onChange={event => setRangeStart(event.target.value)} />
            </div>
            <div className="w-48 space-y-1"><Label htmlFor="tutor-finance-end">{t('common.to')}</Label>
              <DateInput id="tutor-finance-end" value={rangeEnd} onChange={event => setRangeEnd(event.target.value)} />
            </div>
          </>}
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9"
              aria-label={t('common.search')} placeholder={t('compSch.searchPlaceholder')} />
          </div>
        </div>
      </div>
      {period.error ? <p role="alert" className="text-sm text-red-700">{t(period.error, { days: MAX_RANGE_DAYS })}</p>
        : loading ? <p role="status" className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{t('common.loadingDots')}</p>
          : error ? <p role="alert" className="text-sm text-red-700">{t('common.error')}</p>
            : tutors.length === 0 ? <p className="text-sm text-gray-500">{t('orgFinance.noData')}</p>
              : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tutors.map(tutor => (
                  <button key={tutor.id} onClick={() => setSelectedId(tutor.id)}
                    className="text-start rounded-xl border border-gray-200 bg-white p-4 hover:border-indigo-400 focus-visible:outline-indigo-500 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="font-semibold text-gray-900 truncate">{tutor.fullName}</p>
                        <p className="text-xs text-gray-500 truncate">{tutor.email}</p></div>
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                    </div>
                    {tutor.breakdown ? <dl className="text-sm mt-4 space-y-2">
                      <div className="flex justify-between gap-2 text-gray-600"><dt>{t('orgFinance.earnedBeforeAdjustments')}</dt><dd>{fmtMoney(tutor.breakdown.totalEur - tutor.breakdown.adjustmentsEur)}</dd></div>
                      <div className="flex justify-between gap-2 text-gray-600"><dt>{t('orgFinance.adjustments')}</dt><dd>{fmtMoney(tutor.breakdown.adjustmentsEur)}</dd></div>
                      <div className="flex justify-between gap-2 pt-2 border-t border-gray-100 font-semibold text-emerald-700"><dt>{t('orgFinance.payableTotal')}</dt><dd>{fmtMoney(tutor.breakdown.totalEur)}</dd></div>
                    </dl> : <p className="text-sm text-amber-800 mt-4">{t('orgFinance.payRateMissing')}</p>}
                  </button>
                ))}
              </div>}
      <Dialog open={Boolean(selectedId)} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedName || t('companyNav.tutorFinance')}</DialogTitle>
            <DialogDescription>{period.label}</DialogDescription>
          </DialogHeader>
          {activeDetail?.error ? <p role="alert" className="text-sm text-red-700">{t('common.error')}</p>
            : !selectedTutor ? <p role="status" className="text-sm text-gray-500">{t('common.loadingDots')}</p>
              : <>
                {selectedTutor.payRateEur !== null ? <p className="text-sm text-gray-600">{t('orgFinance.fixedPayPerLesson', { amount: selectedTutor.payRateEur.toFixed(2) })}</p> : null}
                <ProKlaseTutorFinanceDetails completedCount={selectedTutor.completedCount} rangeLabel={period.label ?? ''}
                  breakdown={selectedTutor.breakdown} adjustments={selectedTutor.adjustments} />
                <section aria-label={t('invoices.title')} className="pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('invoices.title')}</h3>
                  {downloadError ? <p role="alert" className="text-sm text-red-700 mb-3">{t('common.error')}</p> : null}
                  {activeDetail?.data?.invoices.length === 0 ? <p className="text-sm text-gray-500">{t('invoices.empty')}</p>
                    : <div className="space-y-2">{activeDetail?.data?.invoices.map(invoice => (
                      <div key={invoice.id} className="border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900">{invoice.invoice_number}
                            <span className={cn('ml-2 text-xs', invoice.status === 'paid' ? 'text-emerald-700' : 'text-blue-700')}>
                              {t(invoice.status === 'paid' ? 'invoices.statusPaid' : 'invoices.statusIssued')}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">{invoice.issue_date} · {fmtMoney(Number(invoice.total_amount))}</p>
                          {invoice.period_start && invoice.period_end ? <p className="text-xs text-gray-500">{invoice.period_start} - {invoice.period_end}</p> : null}
                        </div>
                        <Button variant="ghost" size="sm" disabled={downloadingId === invoice.id} onClick={() => void downloadPdf(invoice)}
                          aria-label={`${t('invoices.downloadPdf')} ${invoice.invoice_number}`}>
                          {downloadingId === invoice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </Button>
                      </div>
                    ))}</div>}
                </section>
              </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
