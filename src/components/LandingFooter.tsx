import { Link } from 'react-router-dom';
import { useTranslation, buildLocalizedPath, localizedPagePath, defaultLocaleForHost } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { usePlatform } from '@/contexts/PlatformContext';
import { FEATURE_PAGES } from '@/lib/featurePages';
import { COMPARE_HUB_PATH } from '@/lib/comparisonPages';
import { landingPathForAudience } from '@/lib/marketingAudience';

const HEADING_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500';
const LIST_CLASS = 'mt-4 space-y-2.5 sm:mt-5 sm:space-y-3';
const LINK_CLASS = 'text-[13px] text-zinc-300 transition-colors hover:text-white sm:text-[14px]';

/**
 * `/schools` nests the locale after its prefix and runs under a different
 * router basename, so crossing platforms needs a full page load. Mirrors
 * schoolsLandingHref in LandingNavbar.
 */
function schoolsLandingHref(locale: Locale): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const localeSegment = locale === defaultLocaleForHost(host) ? '' : `/${locale}`;
  return `/schools${localeSegment}`;
}

export default function LandingFooter() {
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();

  const isSchools = platform === 'schools' || platform === 'teachers';
  const brandName = isSchools ? t('nav.brandSchools') : 'Tutlio';
  const lp = (path: string) => buildLocalizedPath(path, locale);

  const columns: { title: string; links: { to: string; label: string; external?: boolean }[] }[] = [
    {
      title: t('landing.footerProduct'),
      links: [
        { to: lp('/features'), label: t('nav.features') },
        { to: lp(FEATURE_PAGES['digital-business-card'].path), label: t('landing.feature.digital-business-card') },
        { to: lp(FEATURE_PAGES.calendar.path), label: t('landing.feature.calendar') },
        { to: lp(FEATURE_PAGES.waitlist.path), label: t('landing.feature.waitlist') },
        { to: lp(FEATURE_PAGES.payments.path), label: t('landing.feature.payments') },
        { to: lp(FEATURE_PAGES.reminders.path), label: t('landing.feature.reminders') },
        { to: lp('/pricing'), label: t('common.prices') },
      ],
    },
    {
      title: t('landing.footerSolutions'),
      links: [
        { to: lp(landingPathForAudience('solo')), label: t('nav.forTutors'), external: isSchools },
        { to: lp(landingPathForAudience('biz')), label: t('nav.forAgencies'), external: isSchools },
        { to: isSchools ? lp('/') : schoolsLandingHref(locale), label: t('nav.forSchools'), external: !isSchools },
        { to: lp(COMPARE_HUB_PATH), label: t('nav.compare'), external: isSchools },
        { to: lp(FEATURE_PAGES.cancellation.path), label: t('landing.feature.cancellation') },
        { to: lp(FEATURE_PAGES.comments.path), label: t('landing.feature.comments') },
      ],
    },
    {
      title: t('landing.footerResources'),
      links: [{ to: lp('/blog'), label: t('nav.blog') }],
    },
    {
      title: t('landing.footerCompany'),
      links: [
        { to: lp(localizedPagePath('about', locale)), label: t('nav.aboutUs') },
        { to: lp(localizedPagePath('contacts', locale)), label: t('common.contacts') },
      ],
    },
  ];

  const legalLinks = [
    { to: lp('/privacy-policy'), label: t('footer.privacyPolicy') },
    { to: lp('/terms'), label: t('footer.terms') },
    { to: lp('/dpa'), label: t('footer.dpa') },
  ];

  return (
    <footer className="mt-auto px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5 lg:px-6 lg:pb-6">
      <div className="overflow-hidden rounded-2xl bg-zinc-900 sm:rounded-3xl lg:rounded-[2rem]">
        <div className="px-5 pb-6 pt-8 sm:px-10 sm:pb-10 sm:pt-12 lg:px-14 lg:pb-12 lg:pt-14">
          <div className="mb-8 sm:mb-10 lg:mb-12">
            <Link to={lp('/')} className="inline-flex items-center gap-2">
              <img src="/logo-icon.png" alt={brandName} className="h-7 w-7 rounded-lg" />
              <span className="text-[17px] font-bold tracking-tight text-white">{brandName}</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-x-6 lg:gap-x-12">
            {columns.map((column, index) => (
              <div key={column.title}>
                <h3 className={HEADING_CLASS}>{column.title}</h3>
                <ul className={LIST_CLASS}>
                  {column.links.map((link) => (
                    <li key={`${link.label}:${link.to}`}>
                      {link.external ? (
                        <a href={link.to} className={LINK_CLASS}>{link.label}</a>
                      ) : (
                        <Link to={link.to} className={LINK_CLASS}>{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>

                {/* Secondary block under Resources, mirroring the reference layout. */}
                {index === 2 && (
                  <div className="mt-6 hidden sm:block">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-600">
                      {t('landing.footerGetStarted')}
                    </span>
                    <ul className="mt-3 space-y-2">
                      <li>
                        <Link to={lp('/login')} className="text-[13px] text-zinc-400 transition-colors hover:text-zinc-200">
                          {t('common.login')}
                        </Link>
                      </li>
                      <li>
                        <Link to={lp('/register')} className="text-[13px] text-zinc-400 transition-colors hover:text-zinc-200">
                          {t('common.register')}
                        </Link>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800">
          <div className="flex flex-col items-center gap-3 px-5 py-5 sm:flex-row sm:justify-between sm:gap-6 sm:px-10 sm:py-5 lg:px-14">
            <span className="text-[12px] text-zinc-500 sm:text-[13px]">
              {t('common.allRightsReserved', { year: new Date().getFullYear() })}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] sm:justify-end sm:gap-x-6 sm:text-[13px]">
              {legalLinks.map((link) => (
                <Link key={link.to} to={link.to} className="text-zinc-500 transition-colors hover:text-zinc-300">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
