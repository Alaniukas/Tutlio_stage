import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { dedupeAuthGetUser } from '@/lib/preload';
import { fetchOrgTutorInvoicesDeduped } from '@/lib/fetchOrgTutorInvoicesDeduped';
import { isOwnOrgTutorInvoice } from '@/lib/orgTutorInvoiceAccess';
import { downloadInvoicePdfFile } from '@/lib/downloadInvoicesZip';
import {
  Euro,
  TrendingUp,
  CalendarRange,
  FileText,
  Plus,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { fmtMoney, isManoKorepetitoriusOrg, isProKlaseOrg } from '@/lib/marketMoney';
import { countProKlaseConfirmedCompleted, sumProKlasePayBreakdown, type ProKlasePayBreakdown, type ProKlaseSessionPayInput } from '@/lib/proKlaseTutorPay';
import type { TutorPayAdjustment } from '@/lib/proKlaseTutorFinance';
import ProKlaseTutorFinanceDetails from '@/components/ProKlaseTutorFinanceDetails';
import { parseTutorPayBySubject, sumOrgTutorLessonsPayEur } from '@/lib/orgTutorLessonPay';
import { schoolTutorPayOccurrences } from '@/lib/schoolTutorLessonPay';
import { resolveSchoolTutorGroupPayRate } from '@/lib/schoolTutorDefaultPay';
import { fetchSchoolTutorAttendancePayRows } from '@/lib/schoolTutorAttendancePay';
import { orgRequiresTutorStatusConfirmation } from '@/lib/sessionStatusConfirmation';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { schoolDate } from '@/lib/schoolTime';
import { useUser } from '@/contexts/UserContext';
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
  pdf_meta?: unknown;
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
  issued_by_user_id: string;
  organization_id?: string | null;
  billing_batch_id?: string | null;
  created_at: string;
}

export default function OrgTutorFinanceSummary() {
  const { t, dateFnsLocale } = useTranslation();
  const { profile } = useUser();
  const proKlasePayMode = isProKlaseOrg(profile?.organization_id);
  const manoPayMode = isManoKorepetitoriusOrg(profile?.organization_id);
  const { payPerLessonEur, loading: policyLoading, invoiceIssuerMode } = useOrgTutorPolicy();
  const { entityType, organizationId: policyOrganizationId, hasFeature, loading: orgLoading, error: orgLoadError } = useOrgFeatures();
  const schoolPayMode = entityType === 'school';
  const requiresSchoolConfirmation = orgRequiresTutorStatusConfirmation(policyOrganizationId || profile?.organization_id, {
    tutor_lesson_status_confirmation: hasFeature('tutor_lesson_status_confirmation'),
  });
  const tutorCanIssueInvoice = invoiceIssuerMode !== 'company';

  const [periodMode, setPeriodMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [rangeStart, setRangeStart] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [noShowCount, setNoShowCount] = useState(0);
  const [payBreakdown, setPayBreakdown] = useState<ProKlasePayBreakdown | null>(null);
  const [payAdjustments, setPayAdjustments] = useState<TutorPayAdjustment[]>([]);
  const [companyPayEur, setCompanyPayEur] = useState<number | null>(null);
  const [manoHasSubjectRates, setManoHasSubjectRates] = useState(false);
  const [schoolKnownPayEur, setSchoolKnownPayEur] = useState<number | null>(null);
  const [schoolUnresolvedCount, setSchoolUnresolvedCount] = useState(0);
  const [schoolKnownCount, setSchoolKnownCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summaryLoadError, setSummaryLoadError] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const rangeLabel = useMemo(() => {
    if (periodMode === 'month') {
      try {
        const d = new Date(month + '-01');
        if (!Number.isFinite(d.getTime())) return '—';
        return format(d, 'LLLL yyyy', { locale: dateFnsLocale });
      } catch {
        return '—';
      }
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
      const user = await dedupeAuthGetUser();
      if (!user) return;

      setLoading(true);
      setSummaryLoadError(false);
      setPayAdjustments([]);
      setNoShowCount(0);
      setSchoolKnownPayEur(null);
      setSchoolUnresolvedCount(0);
      setSchoolKnownCount(0);

      if (orgLoadError || !entityType) {
        setSummaryLoadError(true);
        setLoading(false);
        return;
      }

      let startIso: string;
      let endIso: string;

      if (periodMode === 'month') {
        const monthAnchor = schoolPayMode ? schoolDate(month + '-01') : new Date(month + '-01');
        if (!Number.isFinite(monthAnchor.getTime())) {
          setRangeError(null);
          setCompletedCount(0);
          setLoading(false);
          return;
        }
        const start = startOfMonth(monthAnchor);
        const end = endOfMonth(start);
        startIso = start.toISOString();
        endIso = end.toISOString();
        setRangeError(null);
      } else {
        const a = startOfDay(schoolPayMode ? schoolDate(rangeStart) : parseISO(rangeStart));
        const b = endOfDay(schoolPayMode ? schoolDate(rangeEnd) : parseISO(rangeEnd));
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

      if (payPerLessonEur === null && !schoolPayMode) {
        if (!cancelled) {
          setSummaryLoadError(true);
          setLoading(false);
        }
        return;
      }

      let breakdown: ProKlasePayBreakdown | null = null;
      let companyTotal: number | null = null;
      let manoHasSubjectRatesLocal = false;
      let conductedCount = 0;

      if (schoolPayMode) {
        try {
          const organizationId = policyOrganizationId || profile?.organization_id;
          if (!organizationId) throw new Error('School organization required');
          const [rows, attendanceRows, tutorPayRow, orgRow] = await Promise.all([fetchAllRows<any>((from, to) => supabase
            .from('sessions')
            .select('id, tutor_id, student_id, class_group_id, start_time, end_time, status, subject_id, tutor_pay_eur_snapshot, no_show_reason, status_confirmed_at, subjects(is_group), students!inner(organization_id)')
            .eq('tutor_id', user.id)
            .eq('students.organization_id', organizationId)
            .lte('end_time', new Date().toISOString())
            .gte('start_time', startIso)
            .lte('start_time', endIso)
            .order('start_time')
            .order('id')
            .range(from, to)), fetchSchoolTutorAttendancePayRows({
              tutorId: user.id,
              periodStart: format(schoolDate(startIso), 'yyyy-MM-dd'),
              periodEnd: format(schoolDate(endIso), 'yyyy-MM-dd'),
            }), supabase
              .from('profiles')
              .select('company_commission_percent, company_individual_commission_percent')
              .eq('id', user.id)
              .maybeSingle(), supabase
              .from('organizations')
              .select('default_company_commission_percent')
              .eq('id', organizationId)
              .maybeSingle()]);
          if (cancelled) return;
          const schoolGroupPayRate = resolveSchoolTutorGroupPayRate({
            tutorRate: tutorPayRow.data?.company_commission_percent,
            orgDefaultRate: orgRow.data?.default_company_commission_percent,
            organizationId,
          });
          const occurrences = schoolTutorPayOccurrences([...rows, ...attendanceRows], schoolGroupPayRate, new Date(), {
            requireConfirmation: requiresSchoolConfirmation,
            individualRate: tutorPayRow.data?.company_individual_commission_percent,
          });
          const priced = occurrences.filter((occurrence) => occurrence.payEur !== null);
          setCompletedCount(occurrences.length);
          setSchoolKnownPayEur(Math.round(priced.reduce((sum, occurrence) => sum + occurrence.payEur!, 0) * 100) / 100);
          setSchoolKnownCount(priced.length);
          setSchoolUnresolvedCount(occurrences.length - priced.length);
          setPayBreakdown(null);
          setCompanyPayEur(null);
          setManoHasSubjectRates(false);
        } catch (error) {
          if (cancelled) return;
          console.error('[OrgTutorFinanceSummary]', error);
          setSummaryLoadError(true);
          setCompletedCount(0);
        }
        setLoading(false);
        return;
      }

      if (proKlasePayMode) {
        try {
          if (!profile?.organization_id) throw new Error('Tutor organization required');
          const [sessionRows, adjRows] = await Promise.all([
            fetchAllRows<ProKlaseSessionPayInput & { exclude_from_lesson_count?: boolean | null }>((from, to) => supabase
              .from('sessions')
              .select('id, status, is_complimentary, exclude_from_lesson_count, status_confirmed_at, subjects(is_trial), students!inner(organization_id)')
              .eq('tutor_id', user.id)
              .eq('students.organization_id', profile.organization_id)
              .in('status', ['completed', 'no_show'])
              .lte('end_time', new Date().toISOString())
              .gte('start_time', startIso)
              .lte('start_time', endIso).order('id').range(from, to), Infinity),
            fetchAllRows<TutorPayAdjustment>((from, to) => supabase
              .from('tutor_adjustments')
              .select('id, tutor_id, session_id, type, amount_eur, reason, created_at')
              .eq('tutor_id', user.id)
              .eq('organization_id', profile.organization_id)
              .gte('created_at', startIso)
              .lte('created_at', endIso).order('created_at', { ascending: false }).order('id').range(from, to), Infinity),
          ]);
          const adjustmentsEur = adjRows.reduce((sum, row) => sum + Number(row.amount_eur), 0);
          breakdown = sumProKlasePayBreakdown(sessionRows, payPerLessonEur, adjustmentsEur);
          conductedCount = countProKlaseConfirmedCompleted(sessionRows);
          if (cancelled) return;
          setCompletedCount(conductedCount);
          setPayBreakdown(breakdown);
          setPayAdjustments(adjRows.map(row => ({ ...row, amount_eur: Number(row.amount_eur) })));
          setCompanyPayEur(null);
          setManoHasSubjectRates(false);
        } catch (error) {
          if (cancelled) return;
          console.error('[OrgTutorFinanceSummary]', error);
          setSummaryLoadError(true);
          setCompletedCount(0);
          setPayBreakdown(null);
          setCompanyPayEur(null);
          setManoHasSubjectRates(false);
        }
        setLoading(false);
        return;
      }

      {
        const { data: sessionRows, error: sessionErr } = await supabase
          .from('sessions')
          .select('id, status, price, subject_id, tutor_pay_eur_snapshot')
          .eq('tutor_id', user.id)
          .in('status', ['completed', 'no_show'])
          .lte('end_time', new Date().toISOString())
          .gte('start_time', startIso)
          .lte('start_time', endIso);
        const { data: payProfile, error: payProfileErr } = manoPayMode ? await supabase
          .from('profiles')
          .select('company_commission_by_subject')
          .eq('id', user.id)
          .maybeSingle() : { data: {}, error: null };
        const bySubject = parseTutorPayBySubject((payProfile as any)?.company_commission_by_subject);
        manoHasSubjectRatesLocal = Object.keys(bySubject).length > 0;
        companyTotal = sumOrgTutorLessonsPayEur(
          (sessionRows || []) as Array<{
            subject_id?: string | null;
            price?: number | null;
            tutor_pay_eur_snapshot?: number | null;
          }>,
          payPerLessonEur,
          bySubject,
          profile?.organization_id,
        );
        conductedCount = (sessionRows || []).filter(row => row.status === 'completed').length;
        if (cancelled) return;
        if (sessionErr || payProfileErr || !payProfile) {
          console.error('[OrgTutorFinanceSummary]', sessionErr || payProfileErr || 'Tutor pay profile missing');
          setSummaryLoadError(true);
          setCompletedCount(0);
          setPayBreakdown(null);
          setCompanyPayEur(null);
          setManoHasSubjectRates(false);
        } else {
          setCompletedCount(conductedCount);
          setPayBreakdown(null);
          setCompanyPayEur(companyTotal);
          setNoShowCount((sessionRows || []).filter(row => row.status === 'no_show').length);
          setManoHasSubjectRates(manoHasSubjectRatesLocal);
        }
        setLoading(false);
        return;
      }

    };

    if (!policyLoading && !orgLoading) void load();

    return () => {
      cancelled = true;
    };
  }, [month, periodMode, rangeStart, rangeEnd, policyLoading, orgLoading, orgLoadError, entityType, schoolPayMode, policyOrganizationId, requiresSchoolConfirmation, proKlasePayMode, manoPayMode, payPerLessonEur, profile?.organization_id, t]);

  const fetchInvoices = useCallback(async () => {
    const user = await dedupeAuthGetUser();
    if (!user) return;

    setInvoicesLoading(true);
    try {
      const r = await fetchOrgTutorInvoicesDeduped('');
      if (!r.ok) {
        console.error('[OrgTutorFinanceSummary] invoices fetch:', r.data);
        setInvoices([]);
      } else {
        setInvoices((r.data.invoices as Invoice[]).filter(invoice => isOwnOrgTutorInvoice(invoice, user.id)));
      }
    } catch (error) {
      console.error('[OrgTutorFinanceSummary] invoices fetch error:', error);
      setInvoices([]);
    }
    setInvoicesLoading(false);
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDownloadPdf = async (invoiceId: string) => {
    const target = invoices.find((inv) => inv.id === invoiceId);
    if (!target) return;
    setDownloadingId(invoiceId);
    try {
      const ok = await downloadInvoicePdfFile(target, await authHeaders());
      if (!ok) throw new Error('Failed to download PDF');
    } catch (err) {
      console.error('[OrgTutorFinanceSummary] download:', err);
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

  const gross = schoolKnownPayEur ?? payBreakdown?.totalEur ?? companyPayEur ?? 0;

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
              {policyLoading || orgLoading
                ? t('common.loadingDots')
                : orgLoadError
                  ? t('common.error')
                : payPerLessonEur === null
                  ? t(schoolPayMode ? 'orgFinance.schoolPayPending' : 'common.error')
                  : schoolPayMode
                    ? t('orgFinance.schoolCurrentPayRate', { amount: payPerLessonEur.toFixed(2) })
                  : manoHasSubjectRates
                ? t('orgFinance.payUsesSubjectRates', { amount: payPerLessonEur.toFixed(2) })
                : t('orgFinance.fixedPayPerLesson', { amount: payPerLessonEur.toFixed(2) })}
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
              {t('orgFinance.dateRange')}
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

        {loading || policyLoading || orgLoading ? (
          <p className="text-gray-500 text-sm mt-6">{t('common.loadingDots')}</p>
        ) : rangeError ? null : summaryLoadError || (payPerLessonEur === null && !schoolPayMode) ? (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-6">
            {t('common.error')}
          </p>
        ) : proKlasePayMode && payBreakdown ? (
          <div className="mt-6">
            <ProKlaseTutorFinanceDetails completedCount={completedCount} rangeLabel={rangeLabel}
              breakdown={payBreakdown} adjustments={payAdjustments} />
          </div>
        ) : (
          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 p-4">
            <p className="text-sm text-gray-600">
              {schoolPayMode ? `${t('orgFinance.schoolFinalizedLessons')} (${rangeLabel}):` : t('orgFinance.completedLessons', { range: rangeLabel })}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{completedCount}</p>
            {noShowCount > 0 && (
              <p className="text-sm text-gray-600 mt-2">{t('orgFinance.noShowLessons')} ({noShowCount})</p>
            )}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
              <Euro className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  {schoolPayMode && schoolUnresolvedCount > 0 ? t('orgFinance.schoolKnownPayTotal') : proKlasePayMode ? t('orgFinance.payableTotal') : t('orgFinance.approxInvoiceAmount')}
                </p>
                <p className="text-xl font-bold text-emerald-700">{schoolPayMode && schoolUnresolvedCount > 0 && schoolKnownCount === 0 ? t('orgFinance.schoolPayPending') : fmtMoney(gross)}</p>
              </div>
            </div>
            {schoolPayMode && schoolUnresolvedCount > 0 && (
              <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                {t('orgFinance.schoolUnresolvedPay', { count: schoolUnresolvedCount })}
                <span className="block text-xs mt-1">{t('orgFinance.schoolRateSettingsHint')}</span>
              </p>
            )}
            <p className="text-xs text-gray-400 mt-3">
              {schoolPayMode ? t('orgFinance.schoolSummaryNote') : t('orgFinance.companyPaySummaryNote')}
            </p>
          </div>
        )}
      </div>

      {/* Invoice settings (rekvizitai) — always visible */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-indigo-600" />
            {tutorCanIssueInvoice ? t('invoices.title') : t('invoices.settingsTitle')}
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
            {tutorCanIssueInvoice && (
              <Button
                onClick={() => setIsCreateOpen(true)}
                disabled={manoPayMode && (policyLoading || summaryLoadError || payPerLessonEur === null)}
                className="rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700"
                size="sm"
              >
                <Plus className="w-4 h-4" />
                {t('orgFinance.issueSF')}
              </Button>
            )}
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

        {tutorCanIssueInvoice && (
          <>
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {tutorCanIssueInvoice && (
        <CreateInvoiceModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          isOrgTutor
          onSuccess={() => {
            setIsCreateOpen(false);
            fetchInvoices();
          }}
        />
      )}
    </div>
  );
}
