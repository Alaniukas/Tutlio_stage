import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  Building2,
  Package,
  Banknote,
  FileText,
  UserCheck,
} from 'lucide-react';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';

export default function Pricing() {
  const { t, locale } = useTranslation();
  const [isYearly, setIsYearly] = useState(true);

  const features = [
    { icon: Calendar, text: t('pricing.feature.calendar'), included: true },
    { icon: CreditCard, text: t('pricing.feature.payments'), included: true },
    { icon: Bell, text: t('pricing.feature.reminders'), included: true },
    { icon: Upload, text: t('pricing.feature.files'), included: true },
    { icon: MessageSquare, text: t('pricing.feature.comments'), included: true },
    { icon: Users, text: t('pricing.feature.waitlist'), included: true },
    { icon: TrendingUp, text: t('pricing.feature.finance'), included: true },
    { icon: MessageSquare, text: t('pricing.feature.messaging'), included: true },
    { icon: Package, text: t('pricing.feature.plans'), included: true },
    { icon: Banknote, text: t('pricing.feature.autoPayments'), included: true },
    { icon: FileText, text: t('pricing.feature.invoices'), included: true },
    { icon: UserCheck, text: t('pricing.feature.parents'), included: true },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#f5f5f3] via-[#f0efed] to-white">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-white/40 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-16 pb-20 text-center">
            <h1 className="font-display text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-bold text-gray-900 tracking-tight leading-[1.1] mb-5">
              {t('pricing.title')}
            </h1>
            <p className="text-[15px] lg:text-base text-gray-500 max-w-lg mx-auto mb-10 leading-relaxed">
              {t('pricing.subtitle')}
            </p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className={`text-sm font-medium transition-colors ${!isYearly ? 'text-gray-900' : 'text-gray-400'}`}>
                {t('pricing.monthly')}
              </span>
              <button
                onClick={() => setIsYearly((v) => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${isYearly ? 'bg-[#4f46e5]' : 'bg-gray-300'}`}
                aria-label="Toggle billing period"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${isYearly ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
              <span className={`text-sm font-medium transition-colors ${isYearly ? 'text-gray-900' : 'text-gray-400'}`}>
                {t('pricing.yearly')}
              </span>
              {isYearly && (
                <span className="bg-emerald-500 text-white text-[11px] font-bold px-3 py-0.5 rounded-full">
                  {t('pricing.save25')}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Cards */}
        <section className="max-w-[1200px] mx-auto px-6 pb-20">
          <div className="grid md:grid-cols-3 gap-6 max-w-[960px] mx-auto items-stretch pt-5">
            {/* Standard — monthly or yearly via toggle */}
            <div className="relative bg-[#4f46e5] rounded-2xl p-7 shadow-lg shadow-indigo-200/40 ring-2 ring-[#4f46e5] flex flex-col">
              {isYearly && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-sm">
                  {t('pricing.save25')}
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">
                  {isYearly ? t('pricing.yearly') : t('pricing.monthly')}
                </h3>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-4xl font-bold text-white">
                    {isYearly ? '€14.99' : '€19.99'}
                  </span>
                  <span className="text-indigo-200 text-sm">{t('common.perMonth')}</span>
                </div>
                <p className="text-indigo-200 text-[13px] leading-relaxed">
                  {isYearly ? t('pricing.yearlyDesc') : t('pricing.monthlyDesc')}
                </p>
              </div>
              <ul className="space-y-2.5 mb-7 flex-1">
                <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{t('pricing.allFeatures')}</li>
                <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{t('pricing.unlimitedStudents')}</li>
                <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{t('pricing.freeTrial')}</li>
                <li className="flex items-center gap-2 text-white text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />{isYearly ? t('pricing.saveYearly') : t('pricing.cancelAnytime')}</li>
              </ul>
              <Link
                to="/register"
                className="flex items-center justify-center w-full h-11 rounded-full bg-white text-[#4f46e5] font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
              >
                {t('pricing.startNow')}
              </Link>
            </div>

            {/* Subscription Only */}
            <div className="relative bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4f46e5] text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-sm">
                {t('pricing.noCommissionBadge')}
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{t('pricing.subscriptionOnly')}</h3>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-4xl font-bold text-gray-900">€35</span>
                  <span className="text-gray-400 text-sm">{t('common.perMonth')}</span>
                </div>
                <p className="text-gray-500 text-[13px] leading-relaxed">{t('pricing.subscriptionOnlyDesc')}</p>
              </div>
              <ul className="space-y-2.5 mb-7 flex-1">
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.allFeatures')}</li>
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.manualPayments')}</li>
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.noCommission')}</li>
                <li className="flex items-center gap-2 text-gray-700 text-[13px]"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />{t('pricing.cancelAnytime')}</li>
              </ul>
              <Link
                to="/register?plan=subscription_only"
                className="flex items-center justify-center w-full h-11 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                {t('pricing.startNow')}
              </Link>
            </div>

            {/* Enterprise */}
            <div className="bg-gray-900 rounded-2xl p-7 shadow-lg shadow-gray-900/20 flex flex-col">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <h3 className="text-xl font-bold text-white">{t('pricing.enterprise')}</h3>
                </div>
                <p className="text-gray-400 text-[13px] leading-relaxed">{t('pricing.enterpriseDesc')}</p>
              </div>
              <ul className="space-y-2.5 mb-7 flex-1">
                <li className="flex items-center gap-2 text-gray-300 text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{t('pricing.allFeatures')}</li>
                <li className="flex items-center gap-2 text-gray-300 text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{t('pricing.enterpriseMultiTutor')}</li>
                <li className="flex items-center gap-2 text-gray-300 text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{t('pricing.enterpriseStats')}</li>
                <li className="flex items-center gap-2 text-gray-300 text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{t('pricing.enterpriseAutoInvoices')}</li>
                <li className="flex items-center gap-2 text-gray-300 text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{t('pricing.enterpriseCancelStats')}</li>
                <li className="flex items-center gap-2 text-gray-300 text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{t('pricing.enterpriseCustom')}</li>
                <li className="flex items-center gap-2 text-gray-300 text-[13px]"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{t('pricing.enterpriseSupport')}</li>
              </ul>
              <Link
                to={buildLocalizedPath('/kontaktai', locale)}
                className="flex items-center justify-center w-full h-11 rounded-full bg-white text-gray-900 font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] hover:bg-gray-100 active:scale-[0.98]"
              >
                {t('pricing.contactUs')}
              </Link>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="bg-[#f9f9f8] py-20">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              {t('pricing.allFeaturesInBoth')}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 max-w-[800px] mx-auto">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-5">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <feature.icon className="w-5 h-5 text-[#4f46e5]" />
                  </div>
                  <p className="text-gray-700 text-[13px] font-medium">{feature.text}</p>
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 ml-auto" />
                </div>
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
              { q: t('pricing.faq.trialQ'), a: t('pricing.faq.trialA') },
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
            <Link
              to="/register"
              className="inline-flex items-center justify-center h-12 px-8 text-sm rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
            >
              {t('pricing.start7DayTrial')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
            <p className="text-[12px] text-gray-400 mt-4">{t('pricing.createAccountFirst')}</p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
