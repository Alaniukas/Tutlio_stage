import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/core';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import { FEATURE_PAGES, isFeaturePageId } from '@/lib/featurePages';

function DigitalBusinessCardShowcase({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const assetLocaleSuffix = locale === 'lt' ? '' : `-${locale}`;
  const mobilePreview = `/landing/digital-business-card-mobile${assetLocaleSuffix}.png`;
  const desktopPreview = `/landing/digital-business-card-desktop${assetLocaleSuffix}.png`;

  return (
    <section className="bg-[#17151f] py-16 sm:py-20">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="mb-9 max-w-2xl">
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
            {t('landing.v2.bento4Title')}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            {t('feature.digital-business-card.pageDesc')}
          </p>
        </div>

        <div className="relative mx-auto aspect-[941/1672] w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/10 shadow-2xl shadow-violet-950/30 md:aspect-[1672/941] md:max-w-none">
          <picture key={locale} className="block h-full w-full">
            <source
              media="(min-width: 768px)"
              srcSet={desktopPreview}
            />
            <img
              src={mobilePreview}
              alt={t('feature.digital-business-card.pageTitle')}
              width={941}
              height={1672}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </picture>
        </div>

      </div>
    </section>
  );
}

/**
 * Public marketing page for a single feature (/features/:feature).
 * Mirrors the bot-SSR version in api/feature-render.ts — same i18n keys via
 * the shared config in src/lib/featurePages.ts — so crawlers and humans see
 * the same content.
 */
export default function FeaturePage() {
  const { feature } = useParams<{ feature: string }>();
  const { t, locale } = useTranslation();

  const featureId = feature && isFeaturePageId(feature) ? feature : null;
  const cfg = featureId ? FEATURE_PAGES[featureId] : null;

  useEffect(() => {
    if (!cfg) return;
    applyPageDocumentMeta(`${t(cfg.titleKey)} | Tutlio`, t(cfg.descKey));
  }, [cfg, t]);

  if (!featureId || !cfg) {
    return <Navigate to={buildLocalizedPath('/', locale)} replace />;
  }

  const pricingPath = buildLocalizedPath('/pricing', locale);
  const isBusinessCard = featureId === 'digital-business-card';

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <section className="relative overflow-hidden bg-white">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-white/40 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-16 pb-20 text-center">
            {cfg.badgeKey ? (
              <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-violet-600 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-sm">
                  {t(cfg.badgeKey)}
                </span>
                {isBusinessCard ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700">
                    {t('landing.v2.audienceSolo')}
                  </span>
                ) : null}
              </div>
            ) : null}
            <h1 className="font-display text-[2rem] sm:text-[2.75rem] lg:text-[3.25rem] font-bold text-gray-900 tracking-tight leading-[1.15] mb-5 max-w-3xl mx-auto">
              {t(cfg.titleKey)}
            </h1>
            <p className="text-[15px] lg:text-base text-gray-500 max-w-xl mx-auto leading-relaxed mb-8">
              {t(cfg.descKey)}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to={pricingPath}
                className="inline-flex items-center justify-center h-12 px-8 text-sm rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
              >
                {t('landing.startFree')}
              </Link>
              {isBusinessCard ? (
                <a
                  href="#feature-preview"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-gray-300 px-8 text-sm font-semibold text-gray-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  {t('landing.v2.businessCardCta')}
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {isBusinessCard ? (
          <div id="feature-preview" className="scroll-mt-20">
            <DigitalBusinessCardShowcase locale={locale} />
          </div>
        ) : null}

        <section className="max-w-[1200px] mx-auto px-6 py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">
            {t(`feature.${featureId}.detailsTitle`)}
          </h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {cfg.detailKeys.map((k) => (
              <div key={k} className="bg-white p-6 rounded-2xl border border-gray-100">
                <h3 className="text-[15px] font-bold text-gray-900 mb-2">{t(`feature.${featureId}.${k}`)}</h3>
                <p className="text-gray-500 text-[13px] leading-relaxed">{t(`feature.${featureId}.${k}Desc`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#f9f9f8] py-20">
          <div className="max-w-[760px] mx-auto px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              {t('landing.faqTitle')}
            </h2>
            <div className="divide-y divide-gray-200">
              {cfg.faqKeys.map((k) => (
                <details key={k} className="group py-4">
                  <summary className="cursor-pointer list-none text-[15px] font-semibold text-gray-900 flex items-center justify-between">
                    {t(`feature.${featureId}.faq.${k}Q`)}
                    <span className="ml-4 text-gray-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-[14px] text-gray-500 leading-relaxed">
                    {t(`feature.${featureId}.faq.${k}A`)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{t('landing.ctaTitle')}</h2>
          <p className="text-gray-500 text-[15px] mb-8 max-w-md mx-auto leading-relaxed">{t('landing.ctaDesc')}</p>
          <Link
            to={pricingPath}
            className="inline-flex items-center justify-center h-12 px-8 text-sm rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
          >
            {t('landing.startFree')}
          </Link>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
