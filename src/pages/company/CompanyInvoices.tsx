import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { MonthFilterInput } from '@/components/ui/month-filter-input';
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
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  buyer_snapshot: { name: string; email?: string };
  total_amount: number;
  status: 'issued' | 'paid' | 'cancelled';
  issued_by_user_id: string;
  created_at: string;
  billing_batch_id?: string | null;
  billing_batches?: { paid: boolean } | null;
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
  /** yyyy-MM or '' = visi mėnesiai */
  const [invoiceMonth, setInvoiceMonth] = useState<string>('');
  const [invoicePeriodMode, setInvoicePeriodMode] = useState<'month' | 'range'>('month');
  const [invoiceRangeStart, setInvoiceRangeStart] = useState('');
  const [invoiceRangeEnd, setInvoiceRangeEnd] = useState('');
  const [buyerKindFilter, setBuyerKindFilter] = useState<'all' | 'payer' | 'org'>('all');
  const [orgBuyerNames, setOrgBuyerNames] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAllList, setDownloadingAllList] = useState(false);
  const [tutors, setTutors] = useState<{ id: string; full_name: string }[]>(
    ic?.tutors ?? []
  );
  const [activeTab, setActiveTab] = useState<'invoices' | 'tutors'>('invoices');
  const [selectedTutorIds, setSelectedTutorIds] = useState<Set<string>>(new Set());
  const [tutorPeriodStart, setTutorPeriodStart] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [tutorPeriodEnd, setTutorPeriodEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tutorPeriodMode, setTutorPeriodMode] = useState<'month' | 'range'>('range');
  /** yyyy-MM, naudojama kai tutorPeriodMode === 'month' */
  const [tutorMonth, setTutorMonth] = useState('');
  const [generatingForTutors, setGeneratingForTutors] = useState(false);
  const [lastGeneratedInvoiceIds, setLastGeneratedInvoiceIds] = useState<string[]>([]);
  const [downloadingBundle, setDownloadingBundle] = useState(false);
  const [tutorGenerationError, setTutorGenerationError] = useState<string | null>(null);
  const [alreadyIssuedTutors, setAlreadyIssuedTutors] = useState<string[]>([]);
  const [tutorSessions, setTutorSessions] = useState<Record<string, { count: number; total: number }>>({});
  const [loadingTutorSessions, setLoadingTutorSessions] = useState(false);
  const [invoiceIssuerMode, setInvoiceIssuerMode] = useState<string>('both');
  const [checkingAlreadyIssued, setCheckingAlreadyIssued] = useState(false);

  const tutorEffectiveRange = useMemo(() => {
    if (tutorPeriodMode === 'month' && tutorMonth && /^\d{4}-\d{2}$/.test(tutorMonth)) {
      const [yStr, mStr] = tutorMonth.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const endStr = format(new Date(y, m, 0), 'yyyy-MM-dd');
      return { start, end: endStr };
    }
    return { start: tutorPeriodStart, end: tutorPeriodEnd };
  }, [tutorPeriodMode, tutorMonth, tutorPeriodStart, tutorPeriodEnd]);

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

    const tutorsList = await getOrgVisibleTutors(
      supabase as any,
      orgIdVal,
      'id, full_name, email',
    );

    const { data: orgRow } = await supabase
      .from('organizations')
      .select('invoice_issuer_mode, name')
      .eq('id', orgIdVal)
      .single();
    if (orgRow?.invoice_issuer_mode) setInvoiceIssuerMode(orgRow.invoice_issuer_mode);

    const { data: orgInvProf } = await supabase
      .from('invoice_profiles')
      .select('business_name')
      .eq('organization_id', orgIdVal)
      .maybeSingle();

    const buyerNameSet = new Set<string>();
    for (const raw of [(orgRow as { name?: string } | null)?.name, orgInvProf?.business_name]) {
      const n = (raw || '').trim().toLowerCase();
      if (n) buyerNameSet.add(n);
    }
    setOrgBuyerNames(buyerNameSet);

    let query = supabase
      .from('invoices')
      .select('*, billing_batches(paid)')
      .eq('organization_id', orgIdVal)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (invoiceMonth && /^\d{4}-\d{2}$/.test(invoiceMonth)) {
      const [yStr, mStr] = invoiceMonth.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const endD = new Date(y, m, 0);
      const endStr = format(endD, 'yyyy-MM-dd');
      query = query.gte('issue_date', start).lte('issue_date', endStr);
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
  }, [statusFilter, invoicePeriodMode, invoiceMonth, invoiceRangeStart, invoiceRangeEnd]);

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
      .gte('start_time', tutorEffectiveRange.start)
      .lte('start_time', tutorEffectiveRange.end + 'T23:59:59')
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
  }, [orgId, tutors, tutorEffectiveRange.start, tutorEffectiveRange.end]);

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
              periodStart: tutorEffectiveRange.start,
              periodEnd: tutorEffectiveRange.end,
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
  }, [activeTab, selectedTutorIds, tutorEffectiveRange.start, tutorEffectiveRange.end]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const issueDate = String(inv.issue_date || '').slice(0, 10);
      if (invoicePeriodMode === 'month' && invoiceMonth && /^\d{4}-\d{2}$/.test(invoiceMonth)) {
        const [yStr, mStr] = invoiceMonth.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = format(new Date(y, m, 0), 'yyyy-MM-dd');
        if (issueDate < monthStart || issueDate > monthEnd) return false;
      } else if (
        invoicePeriodMode === 'range' &&
        invoiceRangeStart &&
        invoiceRangeEnd &&
        /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeStart) &&
        /^\d{4}-\d{2}-\d{2}$/.test(invoiceRangeEnd)
      ) {
        const a = invoiceRangeStart <= invoiceRangeEnd ? invoiceRangeStart : invoiceRangeEnd;
        const b = invoiceRangeStart <= invoiceRangeEnd ? invoiceRangeEnd : invoiceRangeStart;
        if (issueDate < a || issueDate > b) return false;
      }

      const bn = String((inv.buyer_snapshot as { name?: string } | undefined)?.name || '')
        .trim()
        .toLowerCase();
      const isOrgBuyer = orgBuyerNames.has(bn);
      if (buyerKindFilter === 'org') return isOrgBuyer;
      if (buyerKindFilter === 'payer') return !isOrgBuyer;
      return true;
    });
  }, [
    invoices,
    buyerKindFilter,
    orgBuyerNames,
    invoicePeriodMode,
    invoiceMonth,
    invoiceRangeStart,
    invoiceRangeEnd,
  ]);

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
            <div className="space-y-2">
              <span className="text-xs text-gray-500 block">{t('invoices.periodFilterLabel')}</span>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setTutorPeriodMode('month');
                    if (!tutorMonth && /^\d{4}-\d{2}-\d{2}$/.test(tutorPeriodStart)) {
                      setTutorMonth(tutorPeriodStart.slice(0, 7));
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    tutorPeriodMode === 'month'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  {t('invoices.periodModeMonth')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTutorPeriodMode('range');
                    if (tutorMonth && /^\d{4}-\d{2}$/.test(tutorMonth)) {
                      const [yStr, mStr] = tutorMonth.split('-');
                      const y = parseInt(yStr, 10);
                      const m = parseInt(mStr, 10);
                      setTutorPeriodStart(`${y}-${String(m).padStart(2, '0')}-01`);
                      setTutorPeriodEnd(format(new Date(y, m, 0), 'yyyy-MM-dd'));
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    tutorPeriodMode === 'range'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  {t('invoices.periodModeRange')}
                </button>
              </div>
              <div className="flex gap-3 items-end flex-wrap">
                {tutorPeriodMode === 'month' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <MonthFilterInput value={tutorMonth} onChange={setTutorMonth} />
                    {tutorMonth ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                        onClick={() => setTutorMonth('')}
                      >
                        {t('invoices.allMonths')}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">{t('invoices.periodFrom')}</label>
                      <DateInput
                        value={tutorPeriodStart}
                        onChange={(e) => setTutorPeriodStart(e.target.value)}
                        className="h-9 min-w-[10.5rem] rounded-lg border-amber-200/80 hover:border-amber-300/90"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">{t('invoices.periodTo')}</label>
                      <DateInput
                        value={tutorPeriodEnd}
                        onChange={(e) => setTutorPeriodEnd(e.target.value)}
                        min={tutorPeriodStart || undefined}
                        className="h-9 min-w-[10.5rem] rounded-lg border-amber-200/80 hover:border-amber-300/90"
                      />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline h-9 flex items-end pb-1"
                  onClick={() => {
                    setTutorMonth('');
                    setTutorPeriodStart(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
                    setTutorPeriodEnd(format(new Date(), 'yyyy-MM-dd'));
                  }}
                >
                  {t('invoices.clearPeriod')}
                </button>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void loadTutorSessions()}>
                  {loadingTutorSessions ? <Loader2 className="w-4 h-4 animate-spin" /> : t('invoices.refreshBtn')}
                </Button>
              </div>
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
                            periodStart: tutorEffectiveRange.start,
                            periodEnd: tutorEffectiveRange.end,
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
                            periodStart: tutorEffectiveRange.start,
                            periodEnd: tutorEffectiveRange.end,
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
                  {t('invoices.alreadyIssuedForPeriod', { from: tutorEffectiveRange.start, to: tutorEffectiveRange.end })}
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

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between mb-4 pb-4 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row flex-wrap gap-4">
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
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('invoices.buyerKindLabel')}</label>
                <div className="flex flex-wrap gap-1">
                  {(['all', 'payer', 'org'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setBuyerKindFilter(k)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                        buyerKindFilter === k
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                      )}
                    >
                      {k === 'all'
                        ? t('invoices.buyerKindAll')
                        : k === 'payer'
                          ? t('invoices.buyerKindPayer')
                          : t('invoices.buyerKindOrg')}
                    </button>
                  ))}
                </div>
              </div>
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
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{t('invoices.empty')}</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">{t('invoices.emptyAfterFilter')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredInvoices.map((inv) => {
                const tutorName = tutors.find(tu => tu.id === inv.issued_by_user_id)?.full_name;
                const buyerNm = String((inv.buyer_snapshot as { name?: string } | undefined)?.name || '')
                  .trim()
                  .toLowerCase();
                const isOrgBuyer = orgBuyerNames.has(buyerNm);
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{inv.invoice_number}</span>
                          {statusBadge(inv.status)}
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-medium',
                              isOrgBuyer ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-800',
                            )}
                          >
                            {isOrgBuyer ? t('invoices.badgeOrgInvoice') : t('invoices.badgePayerInvoice')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {(inv.buyer_snapshot as { name?: string })?.name || '-'}
                          {tutorName && <> {'\u00B7'} {tutorName}</>}
                          {' \u00B7 '}
                          {format(new Date(inv.issue_date), 'yyyy-MM-dd')}
                          {' \u00B7 '}
                          {'\u20AC'}{Number(inv.total_amount).toFixed(2)}
                        </p>
                        {inv.status === 'issued' && inv.billing_batch_id && inv.billing_batches && !inv.billing_batches.paid && (
                          <p className="text-xs text-amber-700 mt-0.5">{t('invoices.checkoutPendingSubtitle')}</p>
                        )}
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
