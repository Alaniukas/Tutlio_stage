import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { useUser } from '@/contexts/UserContext';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import InvoiceSettingsForm from '@/components/InvoiceSettingsForm';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';
import { MonthFilterInput } from '@/components/ui/month-filter-input';
import { DateInput } from '@/components/ui/date-input';
import {
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
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  billing_batch_id?: string | null;
  billing_batches?: { paid: boolean } | null;
}

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { user: ctxUser } = useUser();
  const orgPolicy = useOrgTutorPolicy();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  /** yyyy-MM or '' = visi mėnesiai */
  const [invoiceMonth, setInvoiceMonth] = useState<string>('');
  const [invoicePeriodMode, setInvoicePeriodMode] = useState<'month' | 'range'>('month');
  const [invoiceRangeStart, setInvoiceRangeStart] = useState('');
  const [invoiceRangeEnd, setInvoiceRangeEnd] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAllList, setDownloadingAllList] = useState(false);

  const fetchInvoices = useCallback(async () => {
    if (!ctxUser) return;
    const user = ctxUser;

    setLoading(true);

    let query = supabase
      .from('invoices')
      .select('*, billing_batches(paid)')
      .eq('issued_by_user_id', user.id)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (invoicePeriodMode === 'month' && invoiceMonth && /^\d{4}-\d{2}$/.test(invoiceMonth)) {
      const [yStr, mStr] = invoiceMonth.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const endD = new Date(y, m, 0);
      const endStr = format(endD, 'yyyy-MM-dd');
      query = query.gte('issue_date', start).lte('issue_date', endStr);
    } else if (
      invoicePeriodMode === 'range' &&
      invoiceRangeStart &&
      invoiceRangeEnd &&
      /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeStart) &&
      /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeEnd)
    ) {
      const a = invoiceRangeStart <= invoiceRangeEnd ? invoiceRangeStart : invoiceRangeEnd;
      const b = invoiceRangeStart <= invoiceRangeEnd ? invoiceRangeEnd : invoiceRangeStart;
      query = query.gte('issue_date', a).lte('issue_date', b);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Invoices] fetch error:', error);
    } else {
      setInvoices((data || []) as Invoice[]);
    }
    setLoading(false);
  }, [ctxUser, statusFilter, invoicePeriodMode, invoiceMonth, invoiceRangeStart, invoiceRangeEnd]);

  const hasActivePeriodFilter = useMemo(() => {
    if (invoicePeriodMode === 'month') return Boolean(invoiceMonth && /^\d{4}-\d{2}$/.test(invoiceMonth));
    return Boolean(
      invoiceRangeStart &&
        invoiceRangeEnd &&
        /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeStart) &&
        /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeEnd),
    );
  }, [invoicePeriodMode, invoiceMonth, invoiceRangeStart, invoiceRangeEnd]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const issueDate = String(inv.issue_date || '').slice(0, 10);
      if (invoicePeriodMode === 'month' && invoiceMonth && /^\d{4}-\d{2}$/.test(invoiceMonth)) {
        const [yStr, mStr] = invoiceMonth.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = format(new Date(y, m, 0), 'yyyy-MM-dd');
        return issueDate >= monthStart && issueDate <= monthEnd;
      }
      if (
        invoicePeriodMode === 'range' &&
        invoiceRangeStart &&
        invoiceRangeEnd &&
        /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeStart) &&
        /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeEnd)
      ) {
        const a = invoiceRangeStart <= invoiceRangeEnd ? invoiceRangeStart : invoiceRangeEnd;
        const b = invoiceRangeStart <= invoiceRangeEnd ? invoiceRangeEnd : invoiceRangeStart;
        return issueDate >= a && issueDate <= b;
      }
      return true;
    });
  }, [invoices, invoicePeriodMode, invoiceMonth, invoiceRangeStart, invoiceRangeEnd]);

  useEffect(() => {
    if (!orgPolicy.isOrgTutor) fetchInvoices();
  }, [fetchInvoices, orgPolicy.isOrgTutor]);

  if (!orgPolicy.loading && orgPolicy.isOrgTutor) {
    return <Navigate to="/finance" replace />;
  }

  const handleDownloadAllVisible = async () => {
    if (filteredInvoices.length === 0) return;
    setDownloadingAllList(true);
    try {
      const headers = await authHeaders();
      for (const inv of filteredInvoices) {
        const res = await fetch(`/api/invoice-pdf?id=${inv.id}`, { headers });
        if (!res.ok) continue;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (inv.invoice_number || inv.id).replace(/[/\\?%*:|"<>]/g, '-');
        a.download = `${safeName}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      setDownloadingAllList(false);
    }
  };

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
      console.error('[Invoices] download error:', err);
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

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in px-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-600" />
              {t('invoices.title')}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">{t('invoices.subtitle')}</p>
          </div>
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
            >
              <Plus className="w-4 h-4" />
              {t('invoices.create')}
            </Button>
          </div>
        </div>

        {showSettings && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('invoices.settingsTitle')}</h2>
            <InvoiceSettingsForm
              scope={orgPolicy.isOrgTutor ? 'user' : 'user'}
              allowedEntityTypes={orgPolicy.isOrgTutor ? ['verslo_liudijimas', 'individuali_veikla'] : undefined}
              onSaved={() => setShowSettings(false)}
            />
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('invoices.list')}</h2>
            <div className="flex flex-wrap gap-2">
              {['all', 'issued', 'paid', 'cancelled'].map((status) => (
                <button
                  key={status}
                  type="button"
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

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between mb-4 pb-4 border-b border-gray-100">
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('invoices.periodFilterLabel')}</label>
              <div className="flex flex-wrap gap-1 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setInvoicePeriodMode('month');
                    if (!invoiceMonth && invoiceRangeStart && /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeStart)) {
                      setInvoiceMonth(invoiceRangeStart.slice(0, 7));
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    invoicePeriodMode === 'month'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  {t('invoices.periodModeMonth')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvoicePeriodMode('range');
                    if (invoiceMonth && /^\d{4}-\d{2}$/.test(invoiceMonth)) {
                      const [yStr, mStr] = invoiceMonth.split('-');
                      const y = parseInt(yStr, 10);
                      const m = parseInt(mStr, 10);
                      setInvoiceRangeStart(`${y}-${String(m).padStart(2, '0')}-01`);
                      setInvoiceRangeEnd(format(new Date(y, m, 0), 'yyyy-MM-dd'));
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    invoicePeriodMode === 'range'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  {t('invoices.periodModeRange')}
                </button>
              </div>
              {invoicePeriodMode === 'month' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <MonthFilterInput value={invoiceMonth} onChange={setInvoiceMonth} />
                  {invoiceMonth ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      onClick={() => setInvoiceMonth('')}
                    >
                      {t('invoices.allMonths')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
                    onClick={() => {
                      setInvoiceMonth('');
                      setInvoiceRangeStart('');
                      setInvoiceRangeEnd('');
                    }}
                  >
                    {t('invoices.clearPeriod')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">{t('invoices.periodFrom')}</span>
                    <DateInput
                      value={invoiceRangeStart}
                      onChange={(e) => setInvoiceRangeStart(e.target.value)}
                      className="h-9 min-w-[10.5rem] rounded-lg border-gray-200"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">{t('invoices.periodTo')}</span>
                    <DateInput
                      value={invoiceRangeEnd}
                      onChange={(e) => setInvoiceRangeEnd(e.target.value)}
                      min={invoiceRangeStart || undefined}
                      className="h-9 min-w-[10.5rem] rounded-lg border-gray-200"
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline pb-2"
                    onClick={() => {
                      setInvoiceMonth('');
                      setInvoiceRangeStart('');
                      setInvoiceRangeEnd('');
                    }}
                  >
                    {t('invoices.clearPeriod')}
                  </button>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2 shrink-0"
              disabled={downloadingAllList || filteredInvoices.length === 0}
              onClick={() => void handleDownloadAllVisible()}
            >
              {downloadingAllList ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {t('invoices.downloadAllFiltered', { count: String(filteredInvoices.length) })}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {hasActivePeriodFilter ? t('invoices.emptyAfterFilter') : t('invoices.empty')}
              </p>
              {!hasActivePeriodFilter ? (
                <p className="text-xs text-gray-400 mt-1">{t('invoices.emptyHint')}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredInvoices.map((inv) => (
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
                      {inv.status === 'issued' && inv.billing_batch_id && inv.billing_batches && !inv.billing_batches.paid && (
                        <p className="text-xs text-amber-700 mt-0.5">{t('invoices.checkoutPendingSubtitle')}</p>
                      )}
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
      </div>

      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        isOrgTutor={orgPolicy.isOrgTutor}
        onSuccess={() => {
          setIsCreateOpen(false);
          fetchInvoices();
        }}
      />
    </Layout>
  );
}
