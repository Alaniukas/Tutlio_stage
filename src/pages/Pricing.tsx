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
  ContactRound,
} from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import { usePlatform } from '@/contexts/PlatformContext';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import FeatureIcon from '@/components/landing/FeatureIcon';
import EnterpriseContactModal from '@/components/EnterpriseContactModal';
import EnterprisePlanCard from '@/components/pricing/EnterprisePlanCard';
import TutorPlanCards, { TutorBillingToggle } from '@/components/pricing/TutorPlanCards';
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

            {!isAgencyPricing && (
              <TutorBillingToggle isYearly={isYearly} onChange={setIsYearly} />
            )}

          </div>
        </section>

        {/* Cards */}
        <section id="pricing-plans" className="scroll-mt-24 max-w-[1200px] mx-auto px-6 pb-20">
          {!isAgencyPricing && (
            <div className="pt-5">
              <TutorPlanCards
                promoCode={promoCode}
                checkoutAudience={checkoutAudience}
                isYearly={isYearly}
                onYearlyChange={setIsYearly}
                showBillingToggle={false}
              />
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
                    <FeatureIcon icon={feature.icon} variant="dark" />
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
                    <FeatureIcon icon={feature.icon} />
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
