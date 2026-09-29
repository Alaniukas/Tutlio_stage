import { useEffect } from 'react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import HeroSection from '@/components/landing/HeroSection';
import StepsSection from '@/components/landing/StepsSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import IntegrationsSection from '@/components/landing/IntegrationsSection';
import ShowcaseCards from '@/components/landing/ShowcaseCards';
import CtaBanner from '@/components/landing/CtaBanner';
import BlogSection from '@/components/landing/BlogSection';
import { useTranslation, t as translate } from '@/lib/i18n';
import { applyPageDocumentMeta } from '@/lib/documentMeta';

const FAQ_KEYS = ['whatIs', 'whoFor', 'contracts', 'pricing', 'trial'] as const;

export default function SchoolsLanding() {
  const { t, locale } = useTranslation();

  useEffect(() => {
    const title = `${translate(locale, 'schoolsLanding.heroTitle')}${translate(locale, 'schoolsLanding.heroTitleHighlight')} | ${translate(locale, 'nav.brandSchools')}`;
    applyPageDocumentMeta(title, translate(locale, 'schoolsLanding.heroSubtitle'));
  }, [locale]);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <LandingNavbar audience="agency" />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <HeroSection variant="schools" />
        <StepsSection variant="schools" />
        <FeaturesSection variant="schools" />
        <IntegrationsSection variant="schools" />
        <ShowcaseCards variant="schools" />
        <section className="bg-white py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-3xl px-5 sm:px-6">
            <h2 className="mb-8 text-center font-display text-2xl font-semibold text-zinc-900 sm:text-3xl">
              {t('landing.faqTitle')}
            </h2>
            <div className="space-y-3">
              {FAQ_KEYS.map((key) => (
                <details key={key} className="group rounded-xl border border-zinc-200 px-5 py-4">
                  <summary className="cursor-pointer list-none font-semibold text-zinc-900 marker:hidden">
                    {t(`schoolsLanding.faq.${key}Q`)}
                  </summary>
                  <p className="mt-3 leading-relaxed text-zinc-600">{t(`schoolsLanding.faq.${key}A`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <CtaBanner variant="schools" />
        <BlogSection />
      </main>
      <LandingFooter audience="agency" />
    </div>
  );
}
