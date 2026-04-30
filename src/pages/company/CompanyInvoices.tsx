import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import InvoiceSettingsForm from '@/components/InvoiceSettingsForm';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';
import {
  FileText,
  Plus,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings,
  Users,
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
  const [activeTab, setActiveTab] = useState<'invoices' | 'tutors'>('invoices');
  const [selectedTutorIds, setSelectedTutorIds] = useState<Set<string>>(new Set());
  const [tutorPeriodStart, setTutorPeriodStart] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [tutorPeriodEnd, setTutorPeriodEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [generatingForTutors, setGeneratingForTutors] = useState(false);
  const [lastGeneratedInvoiceIds, setLastGeneratedInvoiceIds] = useState<string[]>([]);
  const [downloadingBundle, setDownloadingBundle] = useState(false);
  const [tutorGenerationError, setTutorGenerationError] = useState<string | null>(null);
  const [alreadyIssuedTutors, setAlreadyIssuedTutors] = useState<string[]>([]);
  const [tutorSessions, setTutorSessions] = useState<Record<string, { count: number; total: number }>>({});
  const [loadingTutorSessions, setLoadingTutorSessions] = useState(false);
  const [invoiceIssuerMode, setInvoiceIssuerMode] = useState<string>('both');
  const [checkingAlreadyIssued, setCheckingAlreadyIssued] = useState(false);

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
    const { data: linkedStudents } = await supabase
      .from('students')
      .select('linked_user_id')
      .eq('organization_id', orgIdVal)
      .not('linked_user_id', 'is', null);
    const linkedStudentUserIds = new Set(
      (linkedStudents || [])
        .map((s: any) => s.linked_user_id)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    );
    const tutorsList = (tutorData || []).filter(
      (tu: { id: string }) => !adminSet.has(tu.id) && !linkedStudentUserIds.has(tu.id),
    );

    const { data: orgRow } = await supabase.from('organizations').select('invoice_issuer_mode').eq('id', orgIdVal).single();
    if (orgRow?.invoice_issuer_mode) setInvoiceIssuerMode(orgRow.invoice_issuer_mode);

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
    // Always refresh in background; cache is only for quick initial paint.
    void loadData();
  }, [loadData]);

  const loadTutorSessions = useCallback(async () => {
    if (!orgId || tutors.length === 0) return;
    setLoadingTutorSessions(true);
    const tutorIds = tutors.map(t => t.id);
    const { data: sessions } = await supabase
      .from('sessions')
      .select('tutor_id, price, status, paid, payment_status')
      .in('tutor_id', tutorIds)
      .gte('start_time', tutorPeriodStart)
      .lte('start_time', tutorPeriodEnd + 'T23:59:59')
      .neq('status', 'cancelled');
    const map: Record<string, { count: number; total: number }> = {};
    for (const s of sessions || []) {
      const isCountedAsPaid = s.status === 'completed' || s.paid === true || ['paid', 'confirmed'].includes(String(s.payment_status || ''));
      if (!isCountedAsPaid) continue;
      if (!map[s.tutor_id]) map[s.tutor_id] = { count: 0, total: 0 };
      map[s.tutor_id].count++;
      map[s.tutor_id].total += Number(s.price) || 0;
    }
    setTutorSessions(map);
    setLoadingTutorSessions(false);
  }, [orgId, tutors, tutorPeriodStart, tutorPeriodEnd]);

  useEffect(() => {
    if (activeTab === 'tutors') void loadTutorSessions();
  }, [activeTab, loadTutorSessions]);

  useEffect(() => {
    if (activeTab !== 'tutors') return;
    const selectedIds = Array.from(selectedTutorIds);
    if (selectedIds.length === 0) {
      setAlreadyIssuedTutors([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setCheckingAlreadyIssued(true);
      const duplicateTutorIds: string[] = [];

      for (const tutorId of selectedIds) {
        try {
          const precheckResp = await fetch('/api/generate-invoice', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({
              tutorId,
              periodStart: tutorPeriodStart,
              periodEnd: tutorPeriodEnd,
              groupingType: 'single',
              isOrgTutor: true,
              precheckOnly: true,
            }),
          });
          const precheckJson = await precheckResp.json().catch(() => ({}));
          if (precheckResp.ok && precheckJson?.reason === 'duplicate') {
            duplicateTutorIds.push(tutorId);
          }
        } catch {
          // Ignore precheck network errors here; generation call still has hard backend protection.
        }
      }

      if (!cancelled) {
        setAlreadyIssuedTutors(duplicateTutorIds);
        setCheckingAlreadyIssued(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedTutorIds, tutorPeriodStart, tutorPeriodEnd]);

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
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

        {/* Tabs */}
        <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('invoices')}
            className={cn('flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors', activeTab === 'invoices' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900')}
          >
            <FileText className="w-4 h-4 inline mr-1.5" />{t('invoices.tabInvoices')}
          </button>
          <button
            onClick={() => setActiveTab('tutors')}
            className={cn('flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors', activeTab === 'tutors' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900')}
          >
            <Users className="w-4 h-4 inline mr-1.5" />{t('invoices.tabTutors')}
          </button>
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

        {/* Tutors tab */}
        {activeTab === 'tutors' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('invoices.tutorEarnings')}</h2>
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('invoices.periodFrom')}</label>
                <input type="date" value={tutorPeriodStart} onChange={e => setTutorPeriodStart(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('invoices.periodTo')}</label>
                <input type="date" value={tutorPeriodEnd} onChange={e => setTutorPeriodEnd(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              </div>
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void loadTutorSessions()}>
                {loadingTutorSessions ? <Loader2 className="w-4 h-4 animate-spin" /> : t('invoices.refreshBtn')}
              </Button>
            </div>

            {loadingTutorSessions ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            ) : tutors.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('invoices.noTutors')}</p>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTutorIds.size === tutors.length}
                    onChange={(e) => setSelectedTutorIds(e.target.checked ? new Set(tutors.map(t => t.id)) : new Set())}
                    className="rounded border-gray-300"
                  />
                  {t('invoices.selectAll')}
                </label>
                {tutors.map(tutor => {
                  const data = tutorSessions[tutor.id] || { count: 0, total: 0 };
                  return (
                    <div key={tutor.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedTutorIds.has(tutor.id)}
                        onChange={(e) => {
                          const next = new Set(selectedTutorIds);
                          e.target.checked ? next.add(tutor.id) : next.delete(tutor.id);
                          setSelectedTutorIds(next);
                        }}
                        className="rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">{tutor.full_name}</p>
                        <p className="text-xs text-gray-500">{data.count} {t('invoices.lessons')} &middot; &euro;{data.total.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedTutorIds.size > 0 && (
              <div className="flex gap-2 mt-2">
                <Button
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700"
                  disabled={generatingForTutors}
                  onClick={async () => {
                    setGeneratingForTutors(true);
                    setTutorGenerationError(null);
                    setAlreadyIssuedTutors([]);
                    const generatedIds: string[] = [];
                    const failedMsgs: string[] = [];
                    const selectedIds = Array.from(selectedTutorIds);
                    const eligibleTutorIds: string[] = [];

                    // Pre-check duplicates for selected tutor set before generation.
                    for (const tutorId of selectedIds) {
                      try {
                        const precheckResp = await fetch('/api/generate-invoice', {
                          method: 'POST',
                          headers: await authHeaders(),
                          body: JSON.stringify({
                            tutorId,
                            periodStart: tutorPeriodStart,
                            periodEnd: tutorPeriodEnd,
                            groupingType: 'single',
                            isOrgTutor: true,
                            precheckOnly: true,
                          }),
                        });
                        const precheckJson = await precheckResp.json().catch(() => ({}));
                        if (!precheckResp.ok) {
                          failedMsgs.push(precheckJson?.error || `${precheckResp.status} ${precheckResp.statusText}`);
                          continue;
                        }
                        if (precheckJson?.canGenerate) {
                          eligibleTutorIds.push(tutorId);
                        }
                      } catch (err) {
                        failedMsgs.push(err instanceof Error ? err.message : 'Unknown error');
                      }
                    }

                    for (const tutorId of eligibleTutorIds) {
                      try {
                        const resp = await fetch('/api/generate-invoice', {
                          method: 'POST',
                          headers: await authHeaders(),
                          body: JSON.stringify({
                            tutorId,
                            periodStart: tutorPeriodStart,
                            periodEnd: tutorPeriodEnd,
                            groupingType: 'single',
                            isOrgTutor: true,
                          }),
                        });
                        if (!resp.ok) {
                          const errJson = await resp.json().catch(() => ({}));
                          const errMsg = errJson?.error || `${resp.status} ${resp.statusText}`;
                          console.error(`Invoice generation for tutor ${tutorId} failed (${resp.status}):`, errMsg);
                          failedMsgs.push(errMsg);
                          continue;
                        }
                        const result = await resp.json();
                        if (result.invoiceIds) generatedIds.push(...result.invoiceIds);
                      } catch (err) {
                        console.error(`Invoice generation for tutor ${tutorId} failed:`, err);
                        failedMsgs.push(err instanceof Error ? err.message : 'Unknown error');
                      }
                    }
                    setGeneratingForTutors(false);
                    setLastGeneratedInvoiceIds(generatedIds);
                    if (failedMsgs.length > 0) setTutorGenerationError(failedMsgs[0]);
                    void loadData();
                  }}
                >
                  {generatingForTutors ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('invoices.generating')}</>
                  ) : (
                    <><FileText className="w-4 h-4 mr-2" />{t('invoices.generateForTutors', { count: String(selectedTutorIds.size) })}</>
                  )}
                </Button>
              </div>
            )}
            {tutorGenerationError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
                <p className="text-sm text-red-700">{tutorGenerationError}</p>
              </div>
            )}
            {alreadyIssuedTutors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">
                <p className="text-sm text-amber-800 font-medium">
                  {t('invoices.alreadyIssuedForPeriod', { from: tutorPeriodStart, to: tutorPeriodEnd })}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {alreadyIssuedTutors
                    .map((id) => tutors.find((tutor) => tutor.id === id)?.full_name || id)
                    .join(', ')}
                </p>
              </div>
            )}
            {checkingAlreadyIssued && selectedTutorIds.size > 0 && (
              <p className="text-xs text-gray-500">{t('invoices.checkingIssuedStatus')}</p>
            )}
            {lastGeneratedInvoiceIds.length > 0 && (
              <Button
                variant="outline"
                className="w-full rounded-xl mt-2 gap-2"
                disabled={downloadingBundle}
                onClick={async () => {
                  setDownloadingBundle(true);
                  try {
                    for (const invId of lastGeneratedInvoiceIds) {
                      const resp = await fetch(`/api/invoice-pdf?id=${invId}`, { headers: await authHeaders() });
                      if (!resp.ok) continue;
                      const blob = await resp.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `invoice-${invId}.pdf`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  } catch (err) {
                    console.error('[CompanyInvoices] bundle download error:', err);
                  } finally {
                    setDownloadingBundle(false);
                  }
                }}
              >
                {downloadingBundle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('invoices.downloadAll', { count: String(lastGeneratedInvoiceIds.length) })}
              </Button>
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
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
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => {
                const tutorName = tutors.find(tu => tu.id === inv.issued_by_user_id)?.full_name;
                return (
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
        )}
      </div>

      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          void loadData();
        }}
        orgTutors={tutors}
      />
    </>
  );
}
