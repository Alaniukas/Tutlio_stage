import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, Bell, MessageSquare, Package, Banknote, FileText, Users,
  FolderOpen, BarChart3, Clock, Palette, PenTool, ArrowRight, CheckCircle,
} from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import {
  FEATURE_PAGE_IDS,
  FEATURE_PAGES,
  FEATURE_HUB_HIGHLIGHT_KEYS,
  featureHubHighlightPath,
  type FeaturePageId,
} from '@/lib/featurePages';

const HIGHLIGHT_ICONS = {
  calendar: CalendarDays,
  reminders: Bell,
  messaging: MessageSquare,
  plans: Package,
  autoPayments: Banknote,
  invoices: FileText,
  parents: Users,
  files: FolderOpen,
  stats: BarChart3,
  waitlist: Clock,
  whiteLabel: Palette,
  whiteboard: PenTool,
} as const;

const DEEP_FEATURE_ICONS: Record<FeaturePageId, typeof CalendarDays> = {
  calendar: CalendarDays,
  waitlist: Clock,
  payments: Banknote,
  reminders: Bell,
  cancellation: CheckCircle,
  comments: FileText,
};

export default function FeaturesIndexPage() {
  const { t, locale } = useTranslation();

  useEffect(() => {
    applyPageDocumentMeta(
      `${t('featuresIndex.title')} | Tutlio`,
      t('featuresIndex.metaDesc'),
    );
  }, [t, locale]);

  const registerPath = buildLocalizedPath('/register', locale);
  const pricingPath = buildLocalizedPath('/pricing', locale);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <section className="relative overflow-hidden bg-gradient-to-b from-[#f5f5f3] via-[#f0efed] to-white">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-white/40 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-16 pb-14 text-center">
            <span className="inline-block px-4 py-1 rounded-full border border-gray-200 text-[12px] font-semibold text-gray-500 mb-5 tracking-wide uppercase">
              {t('featuresIndex.badge')}
            </span>
            <h1 className="font-display text-[2rem] sm:text-[2.75rem] lg:text-[3.25rem] font-bold text-gray-900 tracking-tight leading-[1.15] mb-5 max-w-3xl mx-auto">
              {t('featuresIndex.title')}
            </h1>
            <p className="text-[15px] lg:text-base text-gray-500 max-w-2xl mx-auto leading-relaxed">
              {t('featuresIndex.subtitle')}
            </p>
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-6 py-16">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">
            {t('featuresIndex.deepTitle')}
          </h2>
          <p className="text-center text-gray-500 text-[15px] mb-10 max-w-xl mx-auto">
            {t('featuresIndex.deepSubtitle')}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURE_PAGE_IDS.map((id) => {
              const cfg = FEATURE_PAGES[id];
              const Icon = DEEP_FEATURE_ICONS[id];
              const href = buildLocalizedPath(cfg.path, locale);
              return (
                <Link
                  key={id}
                  to={href}
                  className="group p-6 rounded-2xl border border-gray-100 bg-white hover:border-indigo-200 hover:shadow-lg transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#4f46e5]/10 flex items-center justify-center mb-4 group-hover:bg-[#4f46e5]/15 transition-colors">
                    <Icon className="w-5 h-5 text-[#4f46e5]" />
                  </div>
                  <h3 className="text-[15px] font-bold text-gray-900 mb-2 group-hover:text-[#4f46e5] transition-colors">
                    {t(cfg.titleKey)}
                  </h3>
                  <p className="text-gray-500 text-[13px] leading-relaxed mb-4">{t(cfg.descKey)}</p>
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#4f46e5]">
                    {t('featuresIndex.readMore')} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="bg-[#fafaf9] py-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">
              {t('featuresIndex.allTitle')}
            </h2>
            <p className="text-center text-gray-500 text-[15px] mb-10 max-w-xl mx-auto">
              {t('featuresIndex.allSubtitle')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {FEATURE_HUB_HIGHLIGHT_KEYS.map((key) => {
                const Icon = HIGHLIGHT_ICONS[key];
                const deepPath = featureHubHighlightPath(key);
                const card = (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-[#4f46e5]/10 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-[#4f46e5]" />
                    </div>
                    <h3 className="font-semibold text-gray-900 text-[14px] mb-1.5">{t(`landing.hl.${key}`)}</h3>
                    <p className="text-[12px] sm:text-[13px] text-gray-500 leading-relaxed">{t(`landing.hl.${key}Desc`)}</p>
                  </>
                );
                if (deepPath) {
                  return (
                    <Link
                      key={key}
                      to={buildLocalizedPath(deepPath, locale)}
                      className="p-5 sm:p-6 rounded-2xl border border-gray-100 bg-white/80 hover:shadow-lg hover:border-gray-200 transition-all duration-200"
                    >
                      {card}
                    </Link>
                  );
                }
                return (
                  <div key={key} className="p-5 sm:p-6 rounded-2xl border border-gray-100 bg-white/80">
                    {card}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="max-w-[760px] mx-auto px-6 py-16">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
            {t('landing.faqTitle')}
          </h2>
          <div className="divide-y divide-gray-200">
            {(['whatIs', 'whoFor', 'waitlist', 'freeTrial'] as const).map((f) => (
              <details key={f} className="group py-4">
                <summary className="cursor-pointer list-none text-[15px] font-semibold text-gray-900 flex items-center justify-between">
                  {t(`landing.faq.${f}Q`)}
                  <span className="ml-4 text-gray-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[14px] text-gray-500 leading-relaxed">{t(`landing.faq.${f}A`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-6 py-16 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{t('landing.ctaTitle')}</h2>
          <p className="text-gray-500 text-[15px] mb-8 max-w-md mx-auto leading-relaxed">{t('landing.ctaDesc')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to={registerPath}
              className="inline-flex items-center justify-center h-12 px-8 text-sm rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
            >
              {t('landing.startFree')}
            </Link>
            <Link
              to={pricingPath}
              className="inline-flex items-center justify-center h-12 px-8 text-sm rounded-full border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
            >
              {t('common.prices')}
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
