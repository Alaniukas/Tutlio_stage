import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import InvoiceSettingsForm from '@/components/InvoiceSettingsForm';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';
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
}

export default function InvoicesPage() {
  const { t } = useTranslation();
  const orgPolicy = useOrgTutorPolicy();
  const ic = getCached<any>('tutor_invoices');
  const [invoices, setInvoices] = useState<Invoice[]>(ic?.invoices ?? []);
  const [loading, setLoading] = useState(!ic);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);

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
      console.error('[Invoices] fetch error:', error);
    } else {
      setInvoices((data || []) as Invoice[]);
      if (statusFilter === 'all') setCache('tutor_invoices', { invoices: data || [] });
    }
    setLoading(false);
  }, [statusFilter]);

  const mountRef = useRef(true);
  useEffect(() => {
    if (orgPolicy.isOrgTutor) return;
    if (mountRef.current && getCached('tutor_invoices')) {
      mountRef.current = false;
      return;
    }
    mountRef.current = false;
    fetchInvoices();
  }, [fetchInvoices, orgPolicy.isOrgTutor]);

  if (!orgPolicy.loading && orgPolicy.isOrgTutor) {
    return <Navigate to="/finance" replace />;
  }

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
              <span className="hidden sm:inline">{t('invoices.create')}</span>
              <span className="sm:hidden">{t('invoices.create')}</span>
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('invoices.list')}</h2>
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0">
              {['all', 'issued', 'paid', 'cancelled'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0',
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

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{t('invoices.empty')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('invoices.emptyHint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-2 p-3 sm:p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
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

                  <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
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
