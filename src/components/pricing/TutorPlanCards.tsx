import { lazy, Suspense, useState } from 'react';
import { CheckCircle2, CircleHelp, Loader2 } from 'lucide-react';
import { usePlatform } from '@/contexts/PlatformContext';
import { useTranslation } from '@/lib/i18n';
import { tutorPlanPriceLabels, showPerMonthSuffix } from '@/lib/pricingDisplay';
import { useSubscriptionCurrency } from '@/hooks/useSubscriptionCurrency';
import {
  DEFAULT_SUBSCRIPTION_TRIAL_DAYS,
  EXTENDED_SUBSCRIPTION_TRIAL_DAYS,
  withSubscriptionTrialDays,
} from '@/lib/subscriptionTrialPromo';

const EmbeddedSubscriptionCheckoutDialog = lazy(
  () => import('@/components/pricing/EmbeddedSubscriptionCheckoutDialog'),
);

interface Props {
  promoCode?: string | null;
  checkoutAudience?: 'tutor' | 'schools';
  isYearly?: boolean;
  onYearlyChange?: (isYearly: boolean) => void;
  showBillingToggle?: boolean;
  checkoutMode?: 'hosted' | 'embedded';
  hostedCancelPath?: string;
  ctaLabel?: string;
}

type CheckoutPlan = 'monthly' | 'yearly' | 'subscription_only' | 'subscription_only_yearly';

export function TutorBillingToggle({
  isYearly,
  onChange,
}: {
  isYearly: boolean;
  onChange: (isYearly: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3 mb-7">
      <span className={`text-sm font-medium transition-colors ${!isYearly ? 'text-gray-900' : 'text-gray-400'}`}>
        {t('pricing.monthly')}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isYearly}
        onClick={() => onChange(!isYearly)}
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${isYearly ? 'bg-[#4f46e5]' : 'bg-gray-300'}`}
        aria-label={t('pricing.billingPeriodLabel')}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${isYearly ? 'translate-x-6' : 'translate-x-0'}`}
        />
      </button>
      <span className="inline-flex items-start gap-2">
        <span className={`text-sm font-medium transition-colors ${isYearly ? 'text-gray-900' : 'text-gray-400'}`}>
          {t('pricing.yearly')}
        </span>
        <span className="-mt-2 rounded-full bg-emerald-500 px-3 py-0.5 text-[11px] font-bold text-white">
          {t('pricing.yearlyDiscountBadge')}
        </span>
      </span>
    </div>
  );
}

/** Shared self-serve tutor plan cards used on Pricing and at the quiz offer step. */
export default function TutorPlanCards({
  promoCode,
  checkoutAudience,
  isYearly: controlledIsYearly,
  onYearlyChange,
  showBillingToggle = true,
  checkoutMode = 'hosted',
  hostedCancelPath,
  ctaLabel,
}: Props) {
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();
  const currency = useSubscriptionCurrency();
  const [internalIsYearly, setInternalIsYearly] = useState(false);
  const [planFamily, setPlanFamily] = useState<'standard' | 'no_commission'>('standard');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [embeddedCheckout, setEmbeddedCheckout] = useState<{
    clientSecret: string;
    publishableKey: string;
    completionUrl: string;
  } | null>(null);
  const audience = checkoutAudience
    ?? (platform === 'schools' || platform === 'teachers' ? 'schools' : 'tutor');
  const trialDays = promoCode
    ? EXTENDED_SUBSCRIPTION_TRIAL_DAYS
    : DEFAULT_SUBSCRIPTION_TRIAL_DAYS;
  const trialCopy = (key: string) => withSubscriptionTrialDays(t(key), trialDays);
  const isYearly = controlledIsYearly ?? internalIsYearly;
  const activeCheckoutPlan: CheckoutPlan = planFamily === 'no_commission'
    ? isYearly ? 'subscription_only_yearly' : 'subscription_only'
    : isYearly ? 'yearly' : 'monthly';

  const changeBillingPeriod = (nextIsYearly: boolean) => {
    if (controlledIsYearly === undefined) setInternalIsYearly(nextIsYearly);
    onYearlyChange?.(nextIsYearly);
  };

  const startCheckout = async (plan: CheckoutPlan) => {
    setCheckoutLoading(plan);
    setCheckoutError(null);
    try {
      const response = await fetch('/api/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          locale,
          audience,
          ...(checkoutMode === 'embedded' ? { uiMode: 'embedded' } : {}),
          ...(hostedCancelPath ? { cancelPath: hostedCancelPath } : {}),
          ...(promoCode ? { couponCode: promoCode } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (response.ok && checkoutMode === 'embedded') {
        if (data.clientSecret && data.publishableKey && data.completionUrl) {
          setEmbeddedCheckout({
            clientSecret: data.clientSecret,
            publishableKey: data.publishableKey,
            completionUrl: data.completionUrl,
          });
          setCheckoutLoading(null);
          return;
        }
        setCheckoutError(t('common.error'));
        setCheckoutLoading(null);
        return;
      }
      setCheckoutError(data.error || t('common.error'));
    } catch {
      setCheckoutError(t('common.error'));
    }
    setCheckoutLoading(null);
  };

  return (
    <div className="w-full">
      {checkoutError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 max-w-md mx-auto mb-5">
          {checkoutError}
        </p>
      )}

      {showBillingToggle && (
        <TutorBillingToggle isYearly={isYearly} onChange={changeBillingPeriod} />
      )}

      <div className="grid grid-cols-1 gap-6 max-w-[416px] mx-auto items-stretch pt-1">
        {planFamily === 'standard' ? (
          <div className="relative min-w-0 bg-[#4f46e5] rounded-2xl p-7 shadow-lg shadow-indigo-200/40 ring-2 ring-[#4f46e5] flex flex-col">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white mb-2">
              {isYearly ? t('pricing.yearly') : t('pricing.monthly')}
            </h3>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-4xl font-bold text-white">
                {isYearly ? tutorPlanPriceLabels.yearlyPerMonth(currency) : tutorPlanPriceLabels.monthly(currency)}
              </span>
              <span className="text-indigo-200 text-sm inline-flex items-center gap-1.5">
                {showPerMonthSuffix(currency) ? t('common.perMonth') : null}
                <span className="relative inline-flex items-center group">
                  <CircleHelp className="w-3.5 h-3.5 text-white/70 cursor-help" />
                  <span className="invisible group-hover:visible pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-white/15 bg-white p-2.5 text-xs font-medium text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {t('pricing.studentFeeNote')}
                  </span>
                </span>
              </span>
            </div>
            <p className="text-indigo-200 text-[13px] leading-relaxed">
              {isYearly ? t('pricing.yearlyDesc') : t('pricing.monthlyDesc')}
            </p>
          </div>
          <ul className="space-y-2.5 mb-7 flex-1">
            <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{t('pricing.allFeatures')}</li>
            <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{t('pricing.unlimitedStudents')}</li>
            <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{trialCopy('pricing.freeTrial')}</li>
            <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{isYearly ? t('pricing.saveYearly') : t('pricing.cancelAnytime')}</li>
          </ul>
          <button
            type="button"
            disabled={Boolean(checkoutLoading)}
            onClick={() => startCheckout(activeCheckoutPlan)}
            className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-white text-[#4f46e5] font-semibold text-[13px] whitespace-nowrap transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98] disabled:opacity-70"
          >
            {checkoutLoading === activeCheckoutPlan && <Loader2 className="w-4 h-4 animate-spin" />}
            {ctaLabel ?? t('pricing.startNow')}
          </button>
          <button
            type="button"
            onClick={() => setPlanFamily('no_commission')}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-white/40 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t('pricing.switchToNoCommission')}
          </button>
        </div>
        ) : (
          <div className="relative min-w-0 bg-white rounded-2xl p-7 border border-gray-100 shadow-md transition-shadow flex flex-col">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4f46e5] text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-sm whitespace-nowrap">
            {t('pricing.noCommissionBadge')}
          </div>
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('pricing.subscriptionOnly')}</h3>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-4xl font-bold text-gray-900">
                {isYearly
                  ? tutorPlanPriceLabels.subscriptionOnlyYearlyPerMonth(currency)
                  : tutorPlanPriceLabels.subscriptionOnly(currency)}
              </span>
              {showPerMonthSuffix(currency) ? <span className="text-gray-400 text-sm">{t('common.perMonth')}</span> : null}
            </div>
            <p className="text-gray-500 text-[13px] leading-relaxed">
              {isYearly
                ? t('pricing.subscriptionOnlyYearlyDesc', {
                    total: tutorPlanPriceLabels.subscriptionOnlyYearlyTotal(currency),
                  })
                : t('pricing.subscriptionOnlyDesc')}
            </p>
          </div>
          <ul className="space-y-2.5 mb-7 flex-1">
            <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.allFeatures')}</li>
            <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.manualPayments')}</li>
            <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.noCommission')}</li>
            <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{isYearly ? t('pricing.saveTwentyFivePercent') : t('pricing.cancelAnytime')}</li>
          </ul>
          <button
            type="button"
            disabled={Boolean(checkoutLoading)}
            onClick={() => startCheckout(activeCheckoutPlan)}
            className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-[13px] whitespace-nowrap transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
          >
            {checkoutLoading === activeCheckoutPlan && <Loader2 className="w-4 h-4 animate-spin" />}
            {ctaLabel ?? t('pricing.startNow')}
          </button>
          <button
            type="button"
            onClick={() => setPlanFamily('standard')}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-gray-300 px-4 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t('pricing.switchToStandard')}
          </button>
        </div>
        )}
      </div>
      {embeddedCheckout ? (
        <Suspense fallback={null}>
          <EmbeddedSubscriptionCheckoutDialog
            open
            onOpenChange={(open) => {
              if (!open) setEmbeddedCheckout(null);
            }}
            clientSecret={embeddedCheckout.clientSecret}
            publishableKey={embeddedCheckout.publishableKey}
            completionUrl={embeddedCheckout.completionUrl}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
