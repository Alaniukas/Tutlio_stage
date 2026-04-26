import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { CreditCard, CheckCircle2, ExternalLink, Loader2, Wallet, Layers, FileText, Package, Info, ChevronDown, ChevronUp } from 'lucide-react';
import Toast from '@/components/Toast';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import { getCached, setCache } from '@/lib/dataCache';

type CompanyFinanceCache = {
  orgId: string;
  stripeComplete: boolean;
  paymentTiming: 'before_lesson' | 'after_lesson';
  paymentDeadlineHours: number;
  enablePerLesson: boolean;
  enableMonthlyBilling: boolean;
  enablePrepaidPackages: boolean;
  restrictBookingOnOverdue: boolean;
  orgTutors: { id: string; full_name: string }[];
};

export default function CompanyFinance() {
  const { t } = useTranslation();
  const fc = getCached<CompanyFinanceCache>('company_finance');
  const { loading: orgFeaturesLoading } = useOrgFeatures();
  const location = useLocation();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';
  const [loading, setLoading] = useState(!fc);
  const [orgId, setOrgId] = useState<string | null>(fc?.orgId ?? null);

  const [stripeComplete, setStripeComplete] = useState(fc?.stripeComplete ?? false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const [paymentTiming, setPaymentTiming] = useState<'before_lesson' | 'after_lesson'>(fc?.paymentTiming ?? 'before_lesson');
  const [paymentDeadlineHours, setPaymentDeadlineHours] = useState(fc?.paymentDeadlineHours ?? 24);

  const [enablePerLesson, setEnablePerLesson] = useState(fc?.enablePerLesson ?? true);
  const [enableMonthlyBilling, setEnableMonthlyBilling] = useState(fc?.enableMonthlyBilling ?? false);
  const [enablePrepaidPackages, setEnablePrepaidPackages] = useState(fc?.enablePrepaidPackages ?? false);
  const [restrictBookingOnOverdue, setRestrictBookingOnOverdue] = useState(fc?.restrictBookingOnOverdue ?? false);

  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isSendInvoiceOpen, setIsSendInvoiceOpen] = useState(false);
  const [invoiceScope, setInvoiceScope] = useState<'all_tutors' | 'selected_tutors'>('all_tutors');
  const [invoiceTutorIds, setInvoiceTutorIds] = useState<string[]>([]);
  const [orgTutors, setOrgTutors] = useState<{ id: string; full_name: string }[]>(fc?.orgTutors ?? []);
  const [invoicePeriodStart, setInvoicePeriodStart] = useState('');
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState('');
  const [invoiceDeadlineDays, setInvoiceDeadlineDays] = useState(7);
  const [invoiceUnpaidSessions, setInvoiceUnpaidSessions] = useState<any[]>([]);
  const [invoicePreview, setInvoicePreview] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSending, setInvoiceSending] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  useEffect(() => { if (!getCached('company_finance')) fetchFinanceSettings(); }, []);

  useEffect(() => {
    if (!loading && location.hash === '#billing-models') {
      requestAnimationFrame(() => {
        document.getElementById('billing-models')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [loading, location.hash]);

  useEffect(() => {
    if (!orgId || orgFeaturesLoading) return;
    const params = new URLSearchParams(location.search);
    if (params.get('stripe') === 'success') verifyStripe();
  }, [orgId, location.search, orgFeaturesLoading]);

  const fetchFinanceSettings = async () => {
    if (!getCached('company_finance')) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      setLoading(false);
      return;
    }

    const organizationId = adminRow.organization_id;

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select(
        'stripe_onboarding_complete, payment_timing, payment_deadline_hours, enable_per_lesson, enable_monthly_billing, enable_prepaid_packages, restrict_booking_on_overdue'
      )
      .eq('id', adminRow.organization_id)
      .single();

    let stripeCompleteLocal = false;
    let paymentTimingLocal: 'before_lesson' | 'after_lesson' = 'before_lesson';
    let paymentDeadlineHoursLocal = 24;
    let enablePerLessonLocal = true;
    let enableMonthlyBillingLocal = false;
    let enablePrepaidPackagesLocal = false;
    let restrictBookingOnOverdueLocal = false;

    if (orgError) {
      setToastMessage({ message: t('companyFinance.fetchFailed', { msg: orgError.message }), type: 'error' });
    } else if (orgData) {
      stripeCompleteLocal = orgData.stripe_onboarding_complete || false;
      paymentTimingLocal = (orgData.payment_timing as 'before_lesson' | 'after_lesson') || 'before_lesson';
      paymentDeadlineHoursLocal = orgData.payment_deadline_hours || 24;
      enablePerLessonLocal = orgData.enable_per_lesson ?? true;
      enableMonthlyBillingLocal = orgData.enable_monthly_billing ?? false;
      enablePrepaidPackagesLocal = orgData.enable_prepaid_packages ?? false;
      restrictBookingOnOverdueLocal = orgData.restrict_booking_on_overdue ?? false;
    }

    const { data: adminUsers2 } = await supabase.from('organization_admins').select('user_id').eq('organization_id', adminRow.organization_id);
    const adminIds2 = new Set((adminUsers2 || []).map((a: any) => a.user_id));
    const { data: tutorData2 } = await supabase.from('profiles').select('id, full_name').eq('organization_id', adminRow.organization_id);
    const orgTutorsLocal = (tutorData2 || []).filter((tu: any) => !adminIds2.has(tu.id));

    setOrgId(organizationId);
    setStripeComplete(stripeCompleteLocal);
    setPaymentTiming(paymentTimingLocal);
    setPaymentDeadlineHours(paymentDeadlineHoursLocal);
    setEnablePerLesson(enablePerLessonLocal);
    setEnableMonthlyBilling(enableMonthlyBillingLocal);
    setEnablePrepaidPackages(enablePrepaidPackagesLocal);
    setRestrictBookingOnOverdue(restrictBookingOnOverdueLocal);
    setOrgTutors(orgTutorsLocal);

    setCache('company_finance', {
      orgId: organizationId,
      stripeComplete: stripeCompleteLocal,
      paymentTiming: paymentTimingLocal,
      paymentDeadlineHours: paymentDeadlineHoursLocal,
      enablePerLesson: enablePerLessonLocal,
      enableMonthlyBilling: enableMonthlyBillingLocal,
      enablePrepaidPackages: enablePrepaidPackagesLocal,
      restrictBookingOnOverdue: restrictBookingOnOverdueLocal,
      orgTutors: orgTutorsLocal,
    });

    setLoading(false);
  };

  const handleSaveFinance = async () => {
    if (!orgId) return;

    const { error } = await supabase
      .from('organizations')
      .update({
        payment_timing: paymentTiming,
        payment_deadline_hours: paymentDeadlineHours,
        enable_per_lesson: enablePerLesson,
        enable_monthly_billing: enableMonthlyBilling,
        enable_prepaid_packages: enablePrepaidPackages,
        restrict_booking_on_overdue: restrictBookingOnOverdue,
      })
      .eq('id', orgId);

    if (error) setToastMessage({ message: t('companyFinance.saveFailed', { msg: error.message }), type: 'error' });
    else setToastMessage({ message: t('companyFinance.saveSuccess'), type: 'success' });
  };

  const handleInvoicePreview = async () => {
    if (!invoicePeriodStart || !invoicePeriodEnd) {
      setInvoiceError(t('companyFinance.selectPeriod'));
      return;
    }

    const targetTutorIds = invoiceScope === 'all_tutors'
      ? orgTutors.map(tu => tu.id)
      : invoiceTutorIds;

    if (targetTutorIds.length === 0) {
      setInvoiceError(t('companyFinance.selectAtLeastOne'));
      return;
    }
    setInvoiceLoading(true);
    setInvoiceError(null);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, students!inner(full_name, email), subjects(name)')
        .in('tutor_id', targetTutorIds)
        .neq('status', 'cancelled')
        .gte('start_time', invoicePeriodStart + 'T00:00:00')
        .lte('start_time', invoicePeriodEnd + 'T23:59:59')
        .lte('start_time', new Date().toISOString())
        .eq('paid', false)
        .is('payment_batch_id', null)
        .is('lesson_package_id', null)
        .order('start_time', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        setInvoiceError(t('companyFinance.noUnpaid'));
        setInvoiceUnpaidSessions([]);
        setInvoicePreview(false);
      } else {
        setInvoiceUnpaidSessions(data);
        setInvoicePreview(true);
        setInvoiceError(null);
        setExpandedStudents(new Set());
      }
    } catch (err: any) {
      setInvoiceError(err.message);
    }
    setInvoiceLoading(false);
  };

  const handleSendOrgInvoice = async () => {
    if (!invoiceUnpaidSessions.length) return;
    setInvoiceSending(true);
    setInvoiceError(null);
    try {
      const groupedByTutor = invoiceUnpaidSessions.reduce(
        (acc: Record<string, { sessionIds: string[]; packageIds: string[] }>, s: any) => {
          const tid = s.tutor_id;
          if (!acc[tid]) acc[tid] = { sessionIds: [], packageIds: [] };
          if (s.invoice_row_kind === 'package') acc[tid].packageIds.push(s.id);
          else acc[tid].sessionIds.push(s.id);
          return acc;
        },
        {}
      );

      const tutorIds = Object.keys(groupedByTutor);

      for (const tutorId of tutorIds) {
        const response = await fetch('/api/create-monthly-invoice', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({
            tutorId,
            periodStartDate: invoicePeriodStart,
            periodEndDate: invoicePeriodEnd,
            paymentDeadlineDays: invoiceDeadlineDays,
            sessionIds: groupedByTutor[tutorId].sessionIds,
          }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || t('common.error'));
      }

      setToastMessage({ message: t('companyFinance.invoicesSent', { count: String(tutorIds.length) }), type: 'success' });
      setIsSendInvoiceOpen(false);
      setInvoicePreview(false);
      setInvoiceUnpaidSessions([]);
    } catch (err: any) {
      setInvoiceError(err.message);
    }
    setInvoiceSending(false);
  };

  const handleStripeAction = async (action: 'onboard' | 'manage') => {
    if (!orgId) return;
    setStripeLoading(true); setStripeError(null);
    try {
      const returnUrl = window.location.origin + `${orgBasePath}/finance`;
      const res = await fetch('/api/stripe-connect', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ action, entity: 'org', entityId: orgId, returnUrl }),
      });
      const json = await res.json();
      if (json.url) {
        if (action === 'manage') window.open(json.url, '_blank');
        else window.location.href = json.url;
      } else setStripeError(json.error || t('common.error'));
    } catch (e: any) { setStripeError(e.message); }
    setStripeLoading(false);
  };

  const verifyStripe = async () => {
    if (!orgId) return;
    setStripeLoading(true);
    try {
      const res = await fetch('/api/stripe-connect', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ action: 'verify', entity: 'org', entityId: orgId }),
      });
      const json = await res.json();
      if (json.complete) {
        setStripeComplete(true);
        setToastMessage({ message: t('companyFinance.stripeConnected'), type: 'success' });
      } else {
        setToastMessage({ message: t('companyFinance.stripeIncomplete'), type: 'error' });
      }
    } catch {
      setToastMessage({ message: 'Nepavyko patikrinti Stripe statuso.', type: 'error' });
    }
    setStripeLoading(false);
  };

  if (loading) {
    return (
      <>
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <p className="text-center text-gray-500">{t('common.loading')}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {toastMessage && (
        <Toast message={toastMessage.message} type={toastMessage.type} onClose={() => setToastMessage(null)} />
      )}
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-600" /> {t('companyFinance.title')}
          </h1>
          <p className="text-gray-500 mt-1">
            {t('companyFinance.stripeDesc')}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-violet-600" /> {t('companyFinance.stripePayments')}
          </h2>

          {stripeComplete ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">Stripe Prijungtas ✓</span>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl gap-2"
                onClick={() => handleStripeAction('manage')} disabled={stripeLoading}>
                {stripeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                {t('companyFinance.manageStripe')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <CreditCard className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">{t('companyFinance.stripeNotConnected')}</p>
                  <p className="text-xs text-amber-700 mt-1">{t('companyFinance.stripeOrgConnect')}</p>
                </div>
              </div>
              <Button onClick={() => handleStripeAction('onboard')} disabled={stripeLoading}
                className="rounded-xl gap-2 bg-violet-600 hover:bg-violet-700">
                {stripeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {t('companyFinance.connectOrgStripe')}
              </Button>
              {stripeError && <p className="text-sm text-red-600">{stripeError}</p>}
            </div>
          )}
        </div>

        <div id="billing-models" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 scroll-mt-24">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" /> {t('companyFinance.paymentModels')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('companyFinance.paymentModelsDesc')}
          </p>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 rounded border-gray-300 text-violet-600"
                checked={enablePerLesson}
                onChange={(e) => {
                  setEnablePerLesson(e.target.checked);
                }}
              />
              <span className="text-sm text-gray-800">
                <span className="font-medium">{t('companyFinance.payPerLesson')}</span>
                <span className="block text-xs text-gray-500">
                  {t('companyFinance.payPerLessonHint')}
                </span>
              </span>
            </label>

            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-violet-600"
                  checked={enableMonthlyBilling}
                  onChange={(e) => setEnableMonthlyBilling(e.target.checked)}
                />
                <span className="text-sm text-gray-800">
                  <span className="font-medium">{t('companyFinance.monthlyInvoices')}</span>
                  <span className="block text-xs text-gray-500">{t('companyFinance.monthlyInvoicesDesc')}</span>
                </span>
              </label>
              {enableMonthlyBilling && (
                <div className="ml-7 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800">
                      {t('companyFinance.monthlyInvoiceNote')}
                    </p>
                  </div>
                  <Button size="sm" className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs" onClick={() => {
                    setIsSendInvoiceOpen(true);
                    setInvoiceScope('all_tutors');
                    setInvoiceTutorIds([]);
                    setInvoicePreview(false);
                    setInvoiceUnpaidSessions([]);
                    setInvoiceError(null);
                    const today = new Date();
                    const thirtyAgo = new Date(); thirtyAgo.setDate(today.getDate() - 30);
                    setInvoicePeriodStart(thirtyAgo.toISOString().slice(0, 10));
                    setInvoicePeriodEnd(today.toISOString().slice(0, 10));
                  }}>
                    <FileText className="w-3.5 h-3.5" />
                    {t('companyFinance.sendInvoices')}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-violet-600"
                  checked={enablePrepaidPackages}
                  onChange={(e) => setEnablePrepaidPackages(e.target.checked)}
                />
                <span className="text-sm text-gray-800">
                  <span className="font-medium">{t('companyFinance.prepaidPackages')}</span>
                  <span className="block text-xs text-gray-500">{t('companyFinance.prepaidDesc')}</span>
                </span>
              </label>
              {enablePrepaidPackages && (
                <div className="ml-7 p-4 bg-violet-50 border border-violet-100 rounded-xl flex items-start gap-2">
                  <Package className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-violet-800">
                    {t('companyFinance.packageSendHint')}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <Button onClick={handleSaveFinance} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
              {t('companyFinance.savePaymentModels')}
            </Button>
          </div>
        </div>

        {enablePerLesson && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">{t('companyFinance.paymentRules')}</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['before_lesson', 'after_lesson'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setPaymentTiming(v)}
                  className={cn('flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all',
                    paymentTiming === v ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300')}>
                  <div className={cn('w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                    paymentTiming === v ? 'border-violet-500' : 'border-gray-300')}>
                    {paymentTiming === v && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{v === 'before_lesson' ? t('companyFinance.beforeLesson') : t('companyFinance.afterLesson')}</p>
                    <p className="text-xs text-gray-500">{v === 'before_lesson' ? t('companyFinance.beforeLessonDesc') : t('companyFinance.afterLessonDesc')}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {paymentTiming === 'before_lesson' ? t('companyFinance.hoursBeforeLabel') : t('companyFinance.hoursAfterLabel')}
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={paymentDeadlineHours}
                  onChange={(e) => setPaymentDeadlineHours(parseInt(e.target.value) || 24)}
                  className="rounded-xl w-28"
                />
                <span className="text-sm text-gray-500">{t('common.hours')}</span>
              </div>
            </div>
          </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button onClick={handleSaveFinance} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
                {t('companyFinance.saveFinance')}
              </Button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('companyFinance.studentAccess')}</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 rounded border-gray-300 text-violet-600"
              checked={restrictBookingOnOverdue}
              onChange={(e) => setRestrictBookingOnOverdue(e.target.checked)}
            />
            <span className="text-sm text-gray-800">
              <span className="font-medium">{t('companyFinance.restrictBooking')}</span>
              <span className="block text-xs text-gray-500 mt-1">{t('companyFinance.restrictBookingDesc')}</span>
            </span>
          </label>
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <Button onClick={handleSaveFinance} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
      {/* Org Invoice Dialog */}
      <Dialog open={isSendInvoiceOpen} onOpenChange={setIsSendInvoiceOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" /> {t('companyFinance.sendInvoices')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('companyFinance.sendTo')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setInvoiceScope('all_tutors'); setInvoicePreview(false); setInvoiceError(null); }}
                  className={cn('rounded-xl border px-3 py-2 text-sm font-medium transition-colors', invoiceScope === 'all_tutors' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}
                >
                  {t('companyFinance.allStudents')}
                </button>
                <button
                  type="button"
                  onClick={() => { setInvoiceScope('selected_tutors'); setInvoicePreview(false); setInvoiceError(null); }}
                  className={cn('rounded-xl border px-3 py-2 text-sm font-medium transition-colors', invoiceScope === 'selected_tutors' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}
                >
                  {t('companyFinance.selectTutors')}
                </button>
              </div>
            </div>

            {invoiceScope === 'selected_tutors' && (
              <div className="space-y-1.5">
                <Label>{t('companyFinance.tutorsLabel')}</Label>
                <div className="border rounded-xl p-3 max-h-36 overflow-y-auto space-y-2">
                  {orgTutors.map(tu => (
                    <label key={tu.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invoiceTutorIds.includes(tu.id)}
                        onChange={(e) => {
                          if (e.target.checked) setInvoiceTutorIds(prev => Array.from(new Set([...prev, tu.id])));
                          else setInvoiceTutorIds(prev => prev.filter(id => id !== tu.id));
                          setInvoicePreview(false);
                          setInvoiceError(null);
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                      />
                      <span>{tu.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('companyFinance.periodFrom')}</Label>
                <DateInput value={invoicePeriodStart} onChange={e => { setInvoicePeriodStart(e.target.value); setInvoicePreview(false); }} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('companyFinance.periodTo')}</Label>
                <DateInput value={invoicePeriodEnd} onChange={e => { setInvoicePeriodEnd(e.target.value); setInvoicePreview(false); }} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('companyFinance.paymentTermDays')}</Label>
              <Input type="number" min={1} max={30} value={invoiceDeadlineDays} onChange={e => setInvoiceDeadlineDays(parseInt(e.target.value) || 7)} className="rounded-xl w-28" />
            </div>
            {invoiceError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{invoiceError}</p>}
            {!invoicePreview ? (
              <Button
                onClick={handleInvoicePreview}
                disabled={invoiceLoading || (invoiceScope === 'selected_tutors' && invoiceTutorIds.length === 0)}
                className="w-full rounded-xl"
              >
                {invoiceLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.loading')}</> : t('companyFinance.previewUnpaid')}
              </Button>
            ) : (() => {
              const grouped = invoiceUnpaidSessions.reduce<Record<string, { name: string; sessions: any[] }>>((acc, s: any) => {
                const studentName = s.students?.full_name || s.student_name || '–';
                const key = s.student_id || studentName;
                if (!acc[key]) acc[key] = { name: studentName, sessions: [] };
                acc[key].sessions.push(s);
                return acc;
              }, {});
              const studentEntries = Object.entries(grouped);
              const toggleExpanded = (key: string) => {
                setExpandedStudents(prev => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                });
              };
              return (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    {t('companyFinance.unpaidSessions', { count: String(invoiceUnpaidSessions.length) })}
                    {' · '}
                    {studentEntries.length} {studentEntries.length === 1 ? t('companyFinance.studentSingular') : t('companyFinance.studentPlural')}
                  </p>
                  <div className="border rounded-xl divide-y max-h-[360px] overflow-y-auto">
                    {studentEntries.map(([key, { name, sessions: sList }]) => {
                      const totalPrice = sList.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
                      const isExpanded = expandedStudents.has(key);
                      return (
                        <div key={key}>
                          <button
                            type="button"
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                            onClick={() => toggleExpanded(key)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 text-left truncate">{name}</p>
                                <p className="text-xs text-gray-500 text-left">
                                  {`${sList.length} ${sList.length === 1 ? t('companyFinance.lessonSingular') : t('companyFinance.lessonPlural')}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm font-bold text-gray-900">{`€${totalPrice.toFixed(2)}`}</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="bg-gray-50 border-t border-gray-100">
                              {sList.map((s: any) => (
                                <div key={s.id} className="px-6 py-2 flex justify-between text-xs border-b border-gray-100 last:border-b-0">
                                  <div className="flex gap-2 min-w-0">
                                    <span className="text-gray-500 shrink-0">{new Date(s.start_time).toLocaleDateString('lt-LT')}</span>
                                    <span className="text-gray-600 truncate">
                                      {s.invoice_row_kind === 'package'
                                        ? `${t('companyFinance.packageRowLabel')}${s.subjects?.name ? ` · ${s.subjects.name}` : ''}${s.total_lessons != null ? ` (${s.total_lessons})` : ''}`
                                        : s.subjects?.name || '–'}
                                    </span>
                                  </div>
                                  <span className="font-medium text-gray-700 shrink-0">{s.price != null ? `€${Number(s.price).toFixed(2)}` : '–'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <Button onClick={handleSendOrgInvoice} disabled={invoiceSending} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700">
                    {invoiceSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.sending')}</> : `${t('companyFinance.sendNInvoices')} (${studentEntries.length})`}
                  </Button>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSendInvoiceOpen(false)} className="rounded-xl">{t('companyFinance.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
