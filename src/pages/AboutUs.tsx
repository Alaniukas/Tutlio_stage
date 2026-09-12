import { Link } from 'react-router-dom';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import FeatureIcon from '@/components/landing/FeatureIcon';
import { Target, Heart, Shield, Sparkles } from 'lucide-react';
import { useTranslation, buildLocalizedPath, localizedPagePath } from '@/lib/i18n';

export default function AboutUs() {
  const { t, locale } = useTranslation();

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        {/* Introduction */}
        <section className="max-w-[1200px] mx-auto px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid items-center gap-10 md:grid-cols-2 lg:gap-20">
            <div className="max-w-xl">
              <h1 className="font-display text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-bold text-gray-900 tracking-tight leading-[1.1] mb-5">
                {t('about.title')}
              </h1>
              <p className="text-[15px] lg:text-base text-gray-500 leading-relaxed mb-8">
                {t('about.subtitle')}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                {t('about.missionTitle')}
              </h2>
              <div className="space-y-4">
                <p className="text-[15px] text-gray-500 leading-relaxed">{t('about.missionDesc1')}</p>
                <p className="text-[15px] text-gray-500 leading-relaxed">{t('about.missionDesc2')}</p>
              </div>
            </div>
            <div className="w-full">
              <img
                src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80"
                alt={t('about.missionImgAlt')}
                className="w-full rounded-2xl object-cover aspect-[4/3]"
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
                  <FeatureIcon icon={v.icon} size="lg" className="mx-auto mb-4" />
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
            to={buildLocalizedPath(localizedPagePath('contacts', locale), locale)}
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
