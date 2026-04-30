import { Link } from 'react-router-dom';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { Target, Heart, Shield, Sparkles } from 'lucide-react';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';

export default function AboutUs() {
  const { t, locale } = useTranslation();

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#f5f5f3] via-[#f0efed] to-white">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-white/40 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-16 pb-20 text-center">
            <h1 className="font-display text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-bold text-gray-900 tracking-tight leading-[1.1] mb-5">
              {t('about.title')}
            </h1>
            <p className="text-[15px] lg:text-base text-gray-500 max-w-lg mx-auto leading-relaxed">
              {t('about.subtitle')}
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 space-y-5">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[12px] font-semibold uppercase tracking-wider">
                {t('about.missionBadge')}
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900">{t('about.missionTitle')}</h2>
              <p className="text-[15px] text-gray-500 leading-relaxed">{t('about.missionDesc1')}</p>
              <p className="text-[15px] text-gray-500 leading-relaxed">{t('about.missionDesc2')}</p>
            </div>
            <div className="flex-1 w-full">
              <img
                src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80"
                alt={t('about.missionImgAlt')}
                className="rounded-2xl shadow-lg w-full object-cover aspect-[4/3]"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="bg-[#f9f9f8] py-20">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-14">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{t('about.valuesTitle')}</h2>
              <p className="text-gray-500 text-[15px] max-w-lg mx-auto leading-relaxed">{t('about.valuesDesc')}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: Shield, title: t('about.valueSecurity'), desc: t('about.valueSecurityDesc') },
                { icon: Target, title: t('about.valueFocus'), desc: t('about.valueFocusDesc') },
                { icon: Heart, title: t('about.valueCommunity'), desc: t('about.valueCommunityDesc') },
                { icon: Sparkles, title: t('about.valueInnovation'), desc: t('about.valueInnovationDesc') },
              ].map((v, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 text-center">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-[#4f46e5] mx-auto mb-4">
                    <v.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-[15px] font-bold text-gray-900 mb-2">{v.title}</h3>
                  <p className="text-gray-500 text-[13px] leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{t('about.joinTitle')}</h2>
          <p className="text-gray-500 text-[15px] mb-8 max-w-md mx-auto leading-relaxed">{t('about.joinDesc')}</p>
          <Link
            to={buildLocalizedPath('/kontaktai', locale)}
            className="inline-flex items-center justify-center h-12 px-8 text-sm rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
          >
            {t('about.contactButton')}
          </Link>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
