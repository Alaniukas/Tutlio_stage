import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  CreditCard,
  Bell,
  Upload,
  MessageSquare,
  Users,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  Package,
  Banknote,
  FileText,
  UserCheck,
  CircleHelp,
  Loader2,
  ContactRound,
} from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import { tutorPlanPriceLabels, showPerMonthSuffix } from '@/lib/pricingDisplay';
import { usePlatform } from '@/contexts/PlatformContext';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import EnterpriseContactModal from '@/components/EnterpriseContactModal';
import EnterprisePlanCard from '@/components/pricing/EnterprisePlanCard';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import { getSeoMeta } from '@/lib/seoMeta';
import { resolveMarketingAudience, storeMarketingAudience } from '@/lib/marketingAudience';
import {
  DEFAULT_SUBSCRIPTION_TRIAL_DAYS,
  EXTENDED_SUBSCRIPTION_TRIAL_DAYS,
  normalizeExtendedTrialPromoCode,
  withSubscriptionTrialDays,
} from '@/lib/subscriptionTrialPromo';

function scrollToPricingPlans() {
  const plans = document.getElementById('pricing-plans');
  if (!plans) return;

  plans.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

export default function Pricing() {
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isYearly, setIsYearly] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const audienceParam = searchParams.get('audience');
  const promoCode = normalizeExtendedTrialPromoCode(searchParams.get('promo'));
  const trialDays = promoCode
    ? EXTENDED_SUBSCRIPTION_TRIAL_DAYS
    : DEFAULT_SUBSCRIPTION_TRIAL_DAYS;
  const trialCopy = (key: string) => withSubscriptionTrialDays(t(key), trialDays);
  const pricingAudience = useMemo(
    () => resolveMarketingAudience(audienceParam),
    [audienceParam],
  );
  const isAgencyPricing = pricingAudience === 'agency';

  const checkoutAudience = platform === 'schools' || platform === 'teachers' ? 'schools' : 'tutor';

  useEffect(() => {
    storeMarketingAudience(pricingAudience);
  }, [pricingAudience]);

  useEffect(() => {
    if (searchParams.get('canceled') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('canceled');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (platform !== 'tutors') return;
    const meta = getSeoMeta(locale, 'pricing');
    applyPageDocumentMeta(meta.title, meta.description);
  }, [locale, platform]);

  const startCheckout = async (plan: 'monthly' | 'yearly' | 'subscription_only') => {
    setCheckoutLoading(plan);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          locale,
          audience: checkoutAudience,
          ...(promoCode ? { couponCode: promoCode } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setCheckoutError(data.error || t('common.error'));
    } catch {
      setCheckoutError(t('common.error'));
    }
    setCheckoutLoading(null);
  };

  const digitalBusinessCardPath = buildLocalizedPath('/features/digital-business-card', locale);
  const features: Array<{
    icon: typeof Calendar;
    text: string;
    badge?: string;
    href?: string;
  }> = [
    ...(!isAgencyPricing ? [{
      icon: ContactRound,
      text: t('pricing.feature.digitalBusinessCard'),
      badge: t('featuresIndex.newBadge'),
      href: digitalBusinessCardPath,
    }] : []),
    { icon: Calendar, text: t('pricing.feature.calendar') },
    { icon: CreditCard, text: t('pricing.feature.payments') },
    { icon: Bell, text: t('pricing.feature.reminders') },
    { icon: Upload, text: t('pricing.feature.files') },
    { icon: MessageSquare, text: t('pricing.feature.comments') },
    { icon: Users, text: t('pricing.feature.waitlist') },
    { icon: TrendingUp, text: t('pricing.feature.finance') },
    { icon: MessageSquare, text: t('pricing.feature.messaging') },
    { icon: Package, text: t('pricing.feature.plans') },
    { icon: Banknote, text: t('pricing.feature.autoPayments') },
    { icon: FileText, text: t('pricing.feature.invoices') },
    { icon: UserCheck, text: t('pricing.feature.parents') },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar audience={pricingAudience} />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        {/* Hero */}
        <section className="relative overflow-hidden bg-white">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-white/40 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-16 pb-20 text-center">
            <h1 className="font-display text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-bold text-gray-900 tracking-tight leading-[1.1] mb-5">
              {isAgencyPricing ? (
                <>
                  <span className="block">{t('pricing.title')}</span>
                  <span className="block">{t('pricing.titleAgencySuffix')}</span>
                </>
              ) : t('pricing.title')}
            </h1>
            <p className="text-[15px] lg:text-base text-gray-500 max-w-lg mx-auto mb-10 leading-relaxed">
              {t('pricing.subtitle')}
            </p>

            {promoCode && !isAgencyPricing && (
              <p className="text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 max-w-md mx-auto mb-6">
                {t('subscribe.extendedTrialCodeApplied')}
              </p>
            )}

            {checkoutError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 max-w-md mx-auto mb-6">
                {checkoutError}
              </p>
            )}

            {!isAgencyPricing && (
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className={`text-sm font-medium transition-colors ${!isYearly ? 'text-gray-900' : 'text-gray-400'}`}>
                  {t('pricing.monthly')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isYearly}
                  onClick={() => setIsYearly((v) => !v)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${isYearly ? 'bg-[#4f46e5]' : 'bg-gray-300'}`}
                  aria-label="Toggle billing period"
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
            )}
          </div>
        </section>

        {/* Cards */}
        <section id="pricing-plans" className="scroll-mt-24 max-w-[1200px] mx-auto px-6 pb-20">
          {!isAgencyPricing && (
            <div className="grid md:grid-cols-2 gap-6 max-w-[760px] mx-auto items-stretch pt-5">
            {/* Standard ??? monthly or yearly via toggle */}
            <div className="relative bg-[#4f46e5] rounded-2xl p-7 shadow-lg shadow-indigo-200/40 ring-2 ring-[#4f46e5] flex flex-col">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">
                  {isYearly ? t('pricing.yearly') : t('pricing.monthly')}
                </h3>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-4xl font-bold text-white">
                    {isYearly ? tutorPlanPriceLabels.yearlyPerMonth() : tutorPlanPriceLabels.monthly()}
                  </span>
                  <span className="text-indigo-200 text-sm inline-flex items-center gap-1.5">
                    {showPerMonthSuffix() ? t('common.perMonth') : null}
                    <span className="relative inline-flex items-center group">
                      <CircleHelp className="w-3.5 h-3.5 text-white/70 cursor-help" />
                      <span className="hidden group-hover:block pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-white/15 bg-white p-2.5 text-xs font-medium text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
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
                disabled={!!checkoutLoading}
                onClick={() => startCheckout(isYearly ? 'yearly' : 'monthly')}
                className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-white text-[#4f46e5] font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98] disabled:opacity-70"
              >
                {checkoutLoading === (isYearly ? 'yearly' : 'monthly') && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('pricing.startNow')}
              </button>
            </div>

            {/* Subscription Only */}
            <div className="relative bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4f46e5] text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-sm">
                {t('pricing.noCommissionBadge')}
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{t('pricing.subscriptionOnly')}</h3>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-4xl font-bold text-gray-900">{tutorPlanPriceLabels.subscriptionOnly()}</span>
                  {showPerMonthSuffix() ? <span className="text-gray-400 text-sm">{t('common.perMonth')}</span> : null}
                </div>
                <p className="text-gray-500 text-[13px] leading-relaxed">{t('pricing.subscriptionOnlyDesc')}</p>
              </div>
              <ul className="space-y-2.5 mb-7 flex-1">
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.allFeatures')}</li>
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.manualPayments')}</li>
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.noCommission')}</li>
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.cancelAnytime')}</li>
              </ul>
              <button
                type="button"
                disabled={!!checkoutLoading}
                onClick={() => startCheckout('subscription_only')}
                className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
              >
                {checkoutLoading === 'subscription_only' && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('pricing.startNow')}
              </button>
            </div>

            </div>
          )}

          {/* Enterprise ??? full-width row with the license calculator */}
          {isAgencyPricing && (
            <div className="max-w-[960px] mx-auto pt-5">
              <EnterprisePlanCard audience={checkoutAudience} onBookDemo={() => setEnterpriseOpen(true)} />
            </div>
          )}
        </section>

        {/* Features grid */}
        <section className="bg-[#f9f9f8] py-20">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              {t('pricing.allFeaturesInBoth')}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 max-w-[800px] mx-auto">
              {features.map((feature, index) => (
                feature.href ? (
                  <Link
                    key={feature.text}
                    to={feature.href}
                    className="group flex items-center gap-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-5 transition hover:border-violet-300 hover:shadow-md"
                  >
                    <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                      <feature.icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-gray-800 text-[13px] font-semibold">{feature.text}</p>
                    {feature.badge ? (
                      <span className="ml-auto rounded-full bg-violet-600 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                        {feature.badge}
                      </span>
                    ) : null}
                    <ArrowRight className="h-4 w-4 shrink-0 text-violet-500 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <div key={`${feature.text}-${index}`} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-5">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-[#4f46e5]" />
                    </div>
                    <p className="text-gray-700 text-[13px] font-medium">{feature.text}</p>
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 ml-auto" />
                  </div>
                )
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-[1200px] mx-auto px-6 py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
            {t('pricing.faqTitle')}
          </h2>
          <div className="space-y-3 max-w-[700px] mx-auto">
            {[
              { q: t('pricing.faq.cancelQ'), a: t('pricing.faq.cancelA') },
              { q: trialCopy('pricing.faq.trialQ'), a: trialCopy('pricing.faq.trialA') },
              { q: t('pricing.faq.limitQ'), a: t('pricing.faq.limitA') },
              { q: t('pricing.faq.switchQ'), a: t('pricing.faq.switchA') },
              { q: t('pricing.faq.paymentQ'), a: t('pricing.faq.paymentA') },
            ].map((faq, i) => (
              <div key={i} className="bg-[#f9f9f8] border border-gray-100 rounded-xl p-6">
                <h3 className="text-[15px] font-semibold text-gray-900 mb-1.5">{faq.q}</h3>
                <p className="text-gray-500 text-[13px] leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="max-w-[1200px] mx-auto px-6 pb-20">
          <div className="text-center bg-[#f9f9f8] border border-gray-100 rounded-2xl p-12 max-w-[700px] mx-auto">
            <h2 className="font-display text-2xl font-bold text-gray-900 mb-3">{t('pricing.readyToStart')}</h2>
            <p className="text-gray-500 text-[15px] mb-8 leading-relaxed">{t('pricing.readyToStartDesc')}</p>
            <button
              type="button"
              onClick={isAgencyPricing ? () => setEnterpriseOpen(true) : scrollToPricingPlans}
              className="inline-flex items-center justify-center h-12 px-8 text-sm rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
            >
              {isAgencyPricing
                ? t('pricing.bookDemo')
                : trialCopy('pricing.start7DayTrial')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </section>
      </main>

      <LandingFooter />
      <EnterpriseContactModal open={enterpriseOpen} onOpenChange={setEnterpriseOpen} />
    </div>
  );
}
