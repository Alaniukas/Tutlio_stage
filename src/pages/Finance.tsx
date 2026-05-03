import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { CreditCard, CheckCircle2, ExternalLink, Loader2, Clock, Euro, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import SendInvoiceModal from '@/components/SendInvoiceModal';
import { tutorFinancePageProfileDeduped } from '@/lib/preload';
import { useUser } from '@/contexts/UserContext';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import OrgTutorFinanceSummary from '@/components/OrgTutorFinanceSummary';
import TutorFinanceReport from '@/components/TutorFinanceReport';
import { useTranslation } from '@/lib/i18n';

interface FinanceProfile {
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  payment_timing: 'before_lesson' | 'after_lesson';
  payment_deadline_hours: number;
  enable_per_lesson: boolean;
  enable_monthly_billing: boolean;
  enable_prepaid_packages: boolean;
  restrict_booking_on_overdue: boolean;
  enable_per_student_payment_override: boolean;
}

export default function FinancePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: ctxUser } = useUser();
  const orgPolicy = useOrgTutorPolicy();
  const stripeAutoVerifyRan = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<FinanceProfile>({
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    payment_timing: 'before_lesson',
    payment_deadline_hours: 24,
    enable_per_lesson: true,
    enable_monthly_billing: false,
    enable_prepaid_packages: false,
    restrict_booking_on_overdue: false,
    enable_per_student_payment_override: false,
  });
  const [isSoloTutor, setIsSoloTutor] = useState(true);
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedMessage, setSavedMessage] = useState<'stripe' | 'payment_settings' | null>(null);
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [minBookingHours, setMinBookingHours] = useState(24);

  const [isSendInvoiceModalOpen, setIsSendInvoiceModalOpen] = useState(false);
  const isOrgTutorEffective = orgPolicy.isOrgTutor || !isSoloTutor;

  const verifyStripeOnboarding = useCallback(
    async (opts?: { silent?: boolean; cleanUrl?: boolean }) => {
      const silent = opts?.silent ?? false;
      const cleanUrl = opts?.cleanUrl ?? false;
      if (!userId) return;
      setStripeLoading(true);
      if (!silent) setStripeError(null);
      try {
        const res = await fetch('/api/stripe-connect', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ action: 'verify', entity: 'tutor', entityId: userId }),
        });
        const json = await res.json();
        if (json.complete) {
          setProfile((p) => ({ ...p, stripe_onboarding_complete: true }));
          setSaved(true);
          setSavedMessage('stripe');
          setTimeout(() => {
            setSaved(false);
            setSavedMessage(null);
          }, 4000);
          if (cleanUrl) navigate('/finance', { replace: true });
        } else if (!silent) {
          setStripeError(t('finance.stripeVerifyError'));
        }
      } catch {
        if (!silent) setStripeError(t('finance.stripeCheckFailed'));
      }
      setStripeLoading(false);
    },
    [userId, navigate, t]
  );

  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(location.search);
    if (params.get('stripe') === 'success') void verifyStripeOnboarding({ cleanUrl: true });
  }, [userId, location.search, verifyStripeOnboarding]);

  useEffect(() => {
    if (loading || !userId) return;
    if (stripeAutoVerifyRan.current) return;
    if (new URLSearchParams(location.search).get('stripe') === 'success') return;
    if (!profile.stripe_account_id || profile.stripe_onboarding_complete) return;
    stripeAutoVerifyRan.current = true;
    void verifyStripeOnboarding({ silent: true });
  }, [
    loading,
    userId,
    profile.stripe_account_id,
    profile.stripe_onboarding_complete,
    location.search,
    verifyStripeOnboarding,
  ]);

  useEffect(() => {
    if (!ctxUser) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxUser?.id]);

  const fetchData = async () => {
    if (!ctxUser) return;
    setLoading(true);
    const user = ctxUser;
    setUserId(user.id);

    const { data: tutorData } = await tutorFinancePageProfileDeduped(user.id);

    setIsSoloTutor(!tutorData?.organization_id);

    setProfile({
      stripe_account_id: tutorData?.stripe_account_id || null,
      stripe_onboarding_complete: tutorData?.stripe_onboarding_complete ?? false,
      payment_timing: (tutorData?.payment_timing as 'before_lesson' | 'after_lesson') || 'before_lesson',
      payment_deadline_hours: tutorData?.payment_deadline_hours ?? 24,
      enable_per_lesson: tutorData?.enable_per_lesson ?? true,
      enable_monthly_billing: tutorData?.enable_monthly_billing ?? false,
      enable_prepaid_packages: tutorData?.enable_prepaid_packages ?? false,
      restrict_booking_on_overdue: tutorData?.restrict_booking_on_overdue ?? false,
      enable_per_student_payment_override: tutorData?.enable_per_student_payment_override ?? false,
    });
    setMinBookingHours(tutorData?.min_booking_hours ?? 24);

    setLoading(false);
  };

  const persistFinanceProfile = async (payload: Record<string, unknown>) => {
    if (!userId) return false;
    setSaveError(null);
    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    if (error) {
      console.error('[Finance] profiles update', error);
      setSaveError(error.message || t('finance.saveFailed'));
      return false;
    }
    return true;
  };

  const handleStripeAction = async (action: 'onboard' | 'manage') => {
    if (!userId) return;
    setStripeLoading(true);
    setStripeError(null);
    try {
      const returnUrl = window.location.origin + '/finance';
      const res = await fetch('/api/stripe-connect', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action, entity: 'tutor', entityId: userId, returnUrl }),
      });
      const json = await res.json();
      if (json.url) {
        if (action === 'manage') window.open(json.url, '_blank');
        else window.location.href = json.url;
      } else setStripeError(json.error || t('common.error'));
    } catch (e: any) {
      setStripeError(e.message);
    }
    setStripeLoading(false);
  };

  if (orgPolicy.loading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        </div>
      </Layout>
    );
  }

  if (isOrgTutorEffective) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in px-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('finance.title')}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t('finance.orgSubtitle')}</p>
          </div>
          <OrgTutorFinanceSummary />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto space-y-6 animate-fade-in px-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('finance.title')}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('finance.subtitle')}</p>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl animate-fade-in">
            <span className="text-sm text-red-800">{saveError}</span>
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-700 font-medium">
              {savedMessage === 'stripe' ? t('finance.savedStripe') : t('finance.settingsSaved')}
            </span>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-12 items-start">
          {profile.stripe_onboarding_complete && userId && (
            <div className="xl:col-span-8 min-w-0">
              <TutorFinanceReport userId={userId} />
            </div>
          )}

        <div
          className={cn(
            'bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-7 space-y-6',
            profile.stripe_onboarding_complete && userId ? 'xl:col-span-4' : 'xl:col-span-12',
          )}
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('finance.stripeAccount')}</h2>
            <p className="text-sm text-gray-500">{t('finance.stripeAccountDesc')}</p>
          </div>

          {profile.stripe_onboarding_complete ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-emerald-700">{t('finance.stripeConnected')}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-2 text-sm"
                onClick={() => handleStripeAction('manage')}
                disabled={stripeLoading}
              >
                {stripeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                {t('finance.manageStripe')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <CreditCard className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">{t('finance.stripeNotConnected')}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    {profile.stripe_account_id
                      ? t('finance.stripeCreatedNotVerified')
                      : t('finance.stripeConnectPrompt')}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('finance.howItWorks')}</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">1.</span>
                    <span>{t('finance.step1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">2.</span>
                    <span>{t('finance.step2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">3.</span>
                    <span>{t('finance.step3')}</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                <Button
                  onClick={() => handleStripeAction('onboard')}
                  disabled={stripeLoading}
                  className="rounded-xl gap-2 bg-violet-600 hover:bg-violet-700"
                >
                  {stripeLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {profile.stripe_account_id ? t('finance.continueStripe') : t('finance.connectStripe')}
                </Button>
                {profile.stripe_account_id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={stripeLoading}
                    onClick={() => void verifyStripeOnboarding()}
                  >
                    {t('finance.verifyConnection')}
                  </Button>
                )}
              </div>
              {stripeError && <p className="text-sm text-red-600">{stripeError}</p>}
            </div>
          )}

          <div className="h-px bg-gray-100" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('finance.sfInvoicesTitle')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('finance.sfInvoicesDesc')}</p>
            <Button
              onClick={() => navigate('/invoices')}
              variant="outline"
              className="rounded-xl gap-2"
            >
              <FileText className="w-4 h-4" />
              {t('finance.goToInvoices')}
            </Button>
          </div>

        </div>

        <div className="xl:col-span-12 grid gap-6 lg:grid-cols-2">
          {profile.enable_per_lesson && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('finance.paymentTiming')}</h3>
              <p className="text-sm text-gray-500 mb-4">{t('finance.paymentTimingDesc')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setProfile((p) => ({ ...p, payment_timing: 'before_lesson' }))}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    profile.payment_timing === 'before_lesson'
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-gray-200 hover:border-violet-200'
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <Clock className="w-5 h-5 text-violet-600" />
                    {t('finance.beforeLesson')}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{t('finance.beforeLessonDesc')}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setProfile((p) => ({ ...p, payment_timing: 'after_lesson' }))}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    profile.payment_timing === 'after_lesson'
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-gray-200 hover:border-violet-200'
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <Euro className="w-5 h-5 text-violet-600" />
                    {t('finance.afterLesson')}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{t('finance.afterLessonDesc')}</p>
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-gray-700">
                  {profile.payment_timing === 'before_lesson' ? t('finance.payBefore') : t('finance.payAfter')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={profile.payment_deadline_hours}
                  onChange={(e) => setProfile((p) => ({ ...p, payment_deadline_hours: Math.max(1, parseInt(e.target.value) || 24) }))}
                  className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-sm"
                />
                <span className="text-sm text-gray-500">{t('finance.hoursLabel')}</span>
                {profile.payment_timing === 'before_lesson' && profile.payment_deadline_hours > minBookingHours && (
                  <p className="text-sm text-amber-700 w-full">
                    {t('finance.deadlineWarning', { hours: minBookingHours })}
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={async () => {
                    if (profile.payment_timing === 'before_lesson' && profile.payment_deadline_hours > minBookingHours) return;
                    setSavingPaymentSettings(true);
                    const ok = await persistFinanceProfile({
                      payment_timing: profile.payment_timing,
                      payment_deadline_hours: profile.payment_deadline_hours,
                    });
                    if (ok) {
                      setSaved(true);
                      setSavedMessage('payment_settings');
                      setTimeout(() => { setSaved(false); setSavedMessage(null); }, 3000);
                    }
                    setSavingPaymentSettings(false);
                  }}
                  disabled={savingPaymentSettings || !userId || (profile.payment_timing === 'before_lesson' && profile.payment_deadline_hours > minBookingHours)}
                  className="rounded-xl"
                >
                  {savingPaymentSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
                </Button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('finance.studentAccess')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('finance.studentAccessDesc')}</p>
            <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-violet-200 cursor-pointer transition-all">
              <input
                type="checkbox"
                checked={profile.restrict_booking_on_overdue}
                onChange={(e) => setProfile((p) => ({ ...p, restrict_booking_on_overdue: e.target.checked }))}
                className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5"
              />
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{t('finance.restrictBooking')}</div>
                <p className="text-xs text-gray-600 mt-1">{t('finance.restrictBookingDesc')}</p>
              </div>
            </label>
            <Button
              size="sm"
              className="rounded-xl mt-3"
              onClick={async () => {
                setSavingPaymentSettings(true);
                const ok = await persistFinanceProfile({
                  restrict_booking_on_overdue: profile.restrict_booking_on_overdue,
                });
                if (ok) {
                  setSaved(true);
                  setSavedMessage('payment_settings');
                  setTimeout(() => { setSaved(false); setSavedMessage(null); }, 3000);
                }
                setSavingPaymentSettings(false);
              }}
              disabled={savingPaymentSettings || !userId}
            >
              {savingPaymentSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : t('finance.saveRestriction')}
            </Button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('finance.paymentModels')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('finance.paymentModelsDesc')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-violet-200 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={profile.enable_per_lesson}
                  onChange={(e) => setProfile((p) => ({ ...p, enable_per_lesson: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{t('finance.payPerLesson')}</div>
                  <p className="text-xs text-gray-600 mt-1">{t('finance.payPerLessonDesc')}</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-violet-200 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={profile.enable_monthly_billing}
                  onChange={(e) => setProfile((p) => ({ ...p, enable_monthly_billing: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{t('finance.monthlyInvoices')}</div>
                  <p className="text-xs text-gray-600 mt-1">{t('finance.monthlyInvoicesDesc')}</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-violet-200 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={profile.enable_prepaid_packages}
                  onChange={(e) => setProfile((p) => ({ ...p, enable_prepaid_packages: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{t('finance.lessonPackages')}</div>
                  <p className="text-xs text-gray-600 mt-1">{t('finance.lessonPackagesDesc')}</p>
                </div>
              </label>

              {isSoloTutor && !isOrgTutorEffective && (
                <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-amber-200 bg-amber-50/50 hover:border-amber-300 cursor-pointer transition-all">
                  <input
                    type="checkbox"
                    checked={profile.enable_per_student_payment_override}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, enable_per_student_payment_override: e.target.checked }))
                    }
                    className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{t('finance.perStudentOverride')}</div>
                    <p className="text-xs text-gray-600 mt-1">{t('finance.perStudentOverrideDesc')}</p>
                  </div>
                </label>
              )}
            </div>

            <Button
              size="sm"
              onClick={async () => {
                setSavingPaymentSettings(true);
                const ok = await persistFinanceProfile({
                  enable_per_lesson: profile.enable_per_lesson,
                  enable_monthly_billing: profile.enable_monthly_billing,
                  enable_prepaid_packages: profile.enable_prepaid_packages,
                  enable_per_student_payment_override: profile.enable_per_student_payment_override,
                });
                if (ok) {
                  setSaved(true);
                  setSavedMessage('payment_settings');
                  setTimeout(() => { setSaved(false); setSavedMessage(null); }, 3000);
                }
                setSavingPaymentSettings(false);
              }}
              disabled={savingPaymentSettings || !userId}
              className="rounded-xl mt-4"
            >
              {savingPaymentSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : t('finance.savePaymentModels')}
            </Button>
          </div>

          {profile.enable_monthly_billing && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('finance.monthlyInvoicesTitle')}</h3>
              <p className="text-sm text-gray-500 mb-4">{t('finance.monthlyInvoicesInfo')}</p>

              <Button
                onClick={() => setIsSendInvoiceModalOpen(true)}
                className="rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700 mb-4"
              >
                <FileText className="w-4 h-4" />
                {t('finance.sendInvoicesAll')}
              </Button>

              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-blue-600">ℹ️</div>
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">{t('finance.monthlyHow')}</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>{t('finance.monthlyStep1')}</li>
                    <li>{t('finance.monthlyStep2')}</li>
                    <li>{t('finance.monthlyStep3')}</li>
                    <li>{t('finance.monthlyStep4')}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {profile.enable_prepaid_packages && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('finance.packagesTitle')}</h3>
              <p className="text-sm text-gray-500 mb-4">{t('finance.packagesInfo')}</p>
              <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="text-purple-600">ℹ️</div>
                <div className="text-sm text-purple-800">
                  <p className="font-semibold mb-1">{t('finance.packagesHow')}</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>{t('finance.packagesStep1')}</li>
                    <li>{t('finance.packagesStep2')}</li>
                    <li>{t('finance.packagesStep3')}</li>
                    <li>{t('finance.packagesStep4')}</li>
                    <li>{t('finance.packagesStep5')}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

        </div>
        </div>

      </div>

      <SendInvoiceModal
        isOpen={isSendInvoiceModalOpen}
        onClose={() => setIsSendInvoiceModalOpen(false)}
        onSuccess={() => {
          setIsSendInvoiceModalOpen(false);
        }}
      />
    </Layout>
  );
}
