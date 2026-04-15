import { useState, useEffect, useCallback } from 'react';
import CompanyLayout from '@/components/CompanyLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
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
  buyer_snapshot: { name: string; email?: string };
  total_amount: number;
  status: 'issued' | 'paid' | 'cancelled';
  issued_by_user_id: string;
  created_at: string;
}

export default function CompanyInvoices() {
  const { t } = useTranslation();
  const { loading: orgFeaturesLoading, hasFeature } = useOrgFeatures();
  const manualPaymentsEnabled = !orgFeaturesLoading && hasFeature('manual_payments');
  const ic = getCached<{
    orgId: string;
    invoices: Invoice[];
    tutors: { id: string; full_name: string }[];
  }>('company_invoices');
  const [orgId, setOrgId] = useState<string | null>(ic?.orgId ?? null);
  const [invoices, setInvoices] = useState<Invoice[]>(ic?.invoices ?? []);
  const [loading, setLoading] = useState(!ic);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [tutors, setTutors] = useState<{ id: string; full_name: string }[]>(
    ic?.tutors ?? []
  );

  const loadData = useCallback(async () => {
    if (!getCached('company_invoices')) setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      setOrgId(null);
      setInvoices([]);
      setTutors([]);
      setLoading(false);
      return;
    }

    const orgIdVal = adminRow.organization_id;

    const { data: adminIds } = await supabase
      .from('organization_admins')
      .select('user_id')
      .eq('organization_id', orgIdVal);
    const adminSet = new Set((adminIds || []).map((a: { user_id: string }) => a.user_id));

    const { data: tutorData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('organization_id', orgIdVal);
    const tutorsList = (tutorData || []).filter((tu: { id: string }) => !adminSet.has(tu.id));

    let query = supabase
      .from('invoices')
      .select('*')
      .eq('organization_id', orgIdVal)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    const invoicesList = (data || []) as Invoice[];

    setOrgId(orgIdVal);
    setTutors(tutorsList);
    setInvoices(invoicesList);
    setCache('company_invoices', {
      orgId: orgIdVal,
      invoices: invoicesList,
      tutors: tutorsList,
    });
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (!getCached('company_invoices')) void loadData();
  }, [loadData]);

  const handleDownloadPdf = async (invoiceId: string) => {
    setDownloadingId(invoiceId);
    try {
      const res = await fetch(`/api/invoice-pdf?id=${invoiceId}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[CompanyInvoices] download error:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      issued: 'bg-blue-100 text-blue-700',
      paid: 'bg-green-100 text-green-700',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    return (
      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', styles[status] || styles.issued)}>
        {t(`invoices.status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
      </span>
    );
  };

  return (
    <CompanyLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-600" />
              {t('invoices.titleCompany')}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">{t('invoices.subtitleCompany')}</p>
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

        <div className={showSettings ? '' : 'hidden'}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('invoices.orgSettingsTitle')}</h2>
            <InvoiceSettingsForm
              scope="organization"
              allowedEntityTypes={['mb', 'uab', 'ii', 'individuali_veikla']}
              onSaved={() => setShowSettings(false)}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('invoices.list')}</h2>
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

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{t('invoices.empty')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => {
                const tutorName = tutors.find(tu => tu.id === inv.issued_by_user_id)?.full_name;
                return (
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
                          {(inv.buyer_snapshot as any)?.name || '-'}
                          {tutorName && <> {'\u00B7'} {tutorName}</>}
                          {' \u00B7 '}
                          {format(new Date(inv.issue_date), 'yyyy-MM-dd')}
                          {' \u00B7 '}
                          {'\u20AC'}{Number(inv.total_amount).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadPdf(inv.id)}
                      disabled={downloadingId === inv.id}
                      className="rounded-lg"
                    >
                      {downloadingId === inv.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          void loadData();
        }}
        orgTutors={tutors}
        manualPaymentsEnabled={manualPaymentsEnabled}
      />
    </CompanyLayout>
  );
}
