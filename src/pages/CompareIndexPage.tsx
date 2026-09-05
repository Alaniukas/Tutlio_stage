import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import BigDifferenceBand from '@/components/landing/v2/BigDifferenceBand';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import { COMPARISON_PAGE_IDS, COMPARISON_PAGES } from '@/lib/comparisonPages';

/** Comparison hub (/compare). Mirrors the hub branch of api/compare-render.ts. */
export default function CompareIndexPage() {
  const { t, locale } = useTranslation();

  useEffect(() => {
    applyPageDocumentMeta(t('compare.hub.metaTitle'), t('compare.hub.metaDesc'));
  }, [t, locale]);

  const pricingPath = buildLocalizedPath('/pricing', locale);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar audience="agency" />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <section className="relative overflow-hidden bg-white">
          <div className="relative z-10 mx-auto max-w-[1200px] px-6 pb-14 pt-16 text-center">
            <h1 className="font-display mx-auto mb-5 max-w-3xl text-[2rem] font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-[2.75rem] lg:text-[3.25rem]">
              {t('compare.hub.title')}
            </h1>
            <p className="mx-auto max-w-2xl text-[15px] leading-relaxed text-gray-500 lg:text-base">{t('compare.hub.subtitle')}</p>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 pb-16">
          <div className="grid gap-5 sm:grid-cols-2">
            {COMPARISON_PAGE_IDS.map((id) => {
              const cfg = COMPARISON_PAGES[id];
              return (
                <Link
                  key={id}
                  to={buildLocalizedPath(cfg.path, locale)}
                  className="group rounded-2xl border border-gray-100 bg-white p-6 transition-all duration-200 hover:border-indigo-200 hover:shadow-lg"
                >
                  <h2 className="font-display mb-2 text-xl font-bold text-gray-900 group-hover:text-[#4f46e5]">
                    {t('compare.vsTitle', { name: cfg.name })}
                  </h2>
                  <p className="mb-4 text-[14px] leading-relaxed text-gray-500">{t(`compare.${cfg.keyPrefix}.glance.bestFor`)}</p>
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#4f46e5]">
                    {t('compare.hub.cardCta')} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <BigDifferenceBand />

        <section className="mx-auto max-w-[1200px] px-6 pb-20 text-center">
          <h2 className="font-display mb-3 text-2xl font-bold text-gray-900 sm:text-3xl">{t('compare.ctaTitle')}</h2>
          <p className="mx-auto mb-8 max-w-md text-[15px] leading-relaxed text-gray-500">{t('compare.ctaSub')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to={`${pricingPath}?audience=solo`}
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#4f46e5] px-8 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-[#4338ca] hover:shadow-lg active:scale-[0.98]"
            >
              {t('compare.ctaSolo')}
            </Link>
            <Link
              to={`${pricingPath}?audience=agency`}
              className="inline-flex h-12 items-center justify-center rounded-full border border-gray-300 px-8 text-sm font-semibold text-gray-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
            >
              {t('compare.ctaAgency')}
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
