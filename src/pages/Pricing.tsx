import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
  X
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Pricing() {
  const { t } = useTranslation();

  const features = [
    { icon: Calendar, text: t('pricing.feature.calendar'), included: true },
    { icon: CreditCard, text: t('pricing.feature.payments'), included: true },
    { icon: Bell, text: t('pricing.feature.reminders'), included: true },
    { icon: Upload, text: t('pricing.feature.files'), included: true },
    { icon: MessageSquare, text: t('pricing.feature.comments'), included: true },
    { icon: Users, text: t('pricing.feature.waitlist'), included: true },
    { icon: TrendingUp, text: t('pricing.feature.finance'), included: true },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
                <span className="text-white font-bold text-lg">T</span>
              </div>
              <span className="text-white font-bold text-xl">Tutlio</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/" className="text-white/70 hover:text-white transition-colors text-sm">{t('common.home')}</Link>
              <Link to="/login">
                <Button className="bg-white text-indigo-600 hover:bg-indigo-50 font-semibold">{t('common.login')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">{t('pricing.title')}</h1>
          <p className="text-xl text-indigo-200 max-w-2xl mx-auto mb-8">{t('pricing.subtitle')}</p>
          <Link to="/register">
            <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl px-8 py-6 text-lg font-semibold shadow-xl">
              {t('pricing.tryFree')}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
          <div className="bg-white rounded-3xl p-8 shadow-2xl hover:scale-105 transition-transform">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('pricing.monthly')}</h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold text-indigo-600">€19.99</span>
                <span className="text-gray-500">{t('common.perMonth')}</span>
              </div>
              <p className="text-gray-600 text-sm">{t('pricing.monthlyDesc')}</p>
            </div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-2 text-gray-700"><CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />{t('pricing.allFeatures')}</li>
              <li className="flex items-center gap-2 text-gray-700"><CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />{t('pricing.unlimitedStudents')}</li>
              <li className="flex items-center gap-2 text-gray-700"><CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />{t('pricing.freeTrial')}</li>
              <li className="flex items-center gap-2 text-gray-700"><CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />{t('pricing.cancelAnytime')}</li>
            </ul>
            <Link to="/register" className="block">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-6 text-lg font-semibold">
                {t('pricing.startNow')}<ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl p-8 shadow-2xl hover:scale-105 transition-transform relative overflow-hidden">
            <div className="absolute top-4 right-6 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">{t('pricing.save25')}</div>
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">{t('pricing.yearly')}</h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold text-white">€14.99</span>
                <span className="text-white/70">{t('common.perMonth')}</span>
              </div>
              <p className="text-white/80 text-sm mb-2">{t('pricing.yearlyDesc')}</p>
            </div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-2 text-white"><CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0" />{t('pricing.allFeatures')}</li>
              <li className="flex items-center gap-2 text-white"><CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0" />{t('pricing.unlimitedStudents')}</li>
              <li className="flex items-center gap-2 text-white"><CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0" />{t('pricing.freeTrial')}</li>
              <li className="flex items-center gap-2 text-white"><CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0" />{t('pricing.saveYearly')}</li>
            </ul>
            <Link to="/register" className="block">
              <Button className="w-full bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl py-6 text-lg font-semibold">
                {t('pricing.startNow')}<ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-white text-center mb-8">{t('pricing.allFeaturesInBoth')}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-4 bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-6 h-6 text-indigo-300" />
                </div>
                <div className="flex-1"><p className="text-white font-medium">{feature.text}</p></div>
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8">{t('pricing.faqTitle')}</h2>
          <div className="space-y-4">
            {[
              { q: t('pricing.faq.cancelQ'), a: t('pricing.faq.cancelA') },
              { q: t('pricing.faq.trialQ'), a: t('pricing.faq.trialA') },
              { q: t('pricing.faq.limitQ'), a: t('pricing.faq.limitA') },
              { q: t('pricing.faq.switchQ'), a: t('pricing.faq.switchA') },
              { q: t('pricing.faq.paymentQ'), a: t('pricing.faq.paymentA') },
            ].map((faq, i) => (
              <div key={i} className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-indigo-200 text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-16 text-center bg-white/10 backdrop-blur border border-white/20 rounded-3xl p-12">
          <h2 className="text-3xl font-bold text-white mb-4">{t('pricing.readyToStart')}</h2>
          <p className="text-indigo-200 mb-8 text-lg">{t('pricing.readyToStartDesc')}</p>
          <Link to="/register">
            <Button className="bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl px-8 py-6 text-lg font-semibold">
              {t('pricing.start7DayTrial')}<ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <p className="text-sm text-indigo-300 mt-4">{t('pricing.createAccountFirst')}</p>
        </div>
      </div>

      <footer className="border-t border-white/10 bg-white/5 backdrop-blur mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-indigo-300 text-sm">{t('common.allRightsReserved', { year: new Date().getFullYear() })}</p>
            <div className="flex items-center gap-6">
              <Link to="/" className="text-indigo-300 hover:text-white text-sm transition-colors">{t('common.home')}</Link>
              <Link to="/pricing" className="text-indigo-300 hover:text-white text-sm transition-colors">{t('common.prices')}</Link>
              <a href="mailto:info@tutlio.lt" className="text-indigo-300 hover:text-white text-sm transition-colors">{t('common.contacts')}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
