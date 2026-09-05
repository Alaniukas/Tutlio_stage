import { Link } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useTranslation, buildLocalizedPath, localizedPagePath, defaultLocaleForHost } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import LanguageSelector from '@/components/LanguageSelector';
import { usePlatform } from '@/contexts/PlatformContext';
import { landingPathForAudience, type MarketingAudience } from '@/lib/marketingAudience';
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';

interface LandingNavbarProps {
  audience?: MarketingAudience;
}

interface NavbarAudienceCtaProps {
  href: string;
  label: string;
  className: string;
  onNavigate?: () => void;
}

function NavbarAudienceCta({
  href,
  label,
  className,
  onNavigate,
}: NavbarAudienceCtaProps) {
  return (
    <Link to={href} onClick={onNavigate} className={className}>
      {label}
    </Link>
  );
}

interface SolutionLinkItem {
  key: string;
  href: string;
  label: string;
  /** Same router basename: client-side navigation is safe. */
  samePlatform: boolean;
}

/**
 * The solo, agency and comparison pages live on the default platform;
 * `/schools` nests the locale after its prefix and runs under a different
 * router basename, so crossing platforms needs a full page load.
 */
function schoolsLandingHref(locale: Locale): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const localeSegment = locale === defaultLocaleForHost(host) ? '' : `/${locale}`;
  return `/schools${localeSegment}`;
}

function SolutionLink({
  link,
  className,
  onNavigate,
}: {
  link: SolutionLinkItem;
  className: string;
  onNavigate?: () => void;
}) {
  if (link.samePlatform) {
    return <Link to={link.href} onClick={onNavigate} className={className}>{link.label}</Link>;
  }
  return <a href={link.href} onClick={onNavigate} className={className}>{link.label}</a>;
}

/** Horizontal space inside the shrunken pill that isn't nav content. */
const PILL_BRAND_GAP = 32; // ms-8 between the brand and the links
const PILL_GROUP_GAP = 32; // breathing room between links and actions
const PILL_PADDING = 40; // 0 20px
const PILL_INITIAL_WIDTH = 1200;
const PILL_EXPANDED_EXTRA_WIDTH = 96;
const NAV_VIEWPORT_GUTTER = 16;
// Keep the trailing CTA comfortably inside the pill. This also absorbs small
// differences between measured and painted text metrics across locale fonts.
const NAV_EDGE_CLEARANCE = 24;
const DESKTOP_NAV_MIN_WIDTH = 768;

export function resolveLandingNavbarLayout(naturalWidth: number, viewportWidth: number) {
  const availableWidth = Math.max(0, viewportWidth - NAV_VIEWPORT_GUTTER * 2);
  const requiredWidth = Math.ceil(naturalWidth) + NAV_EDGE_CLEARANCE;
  return {
    availableWidth,
    pillWidth: Math.min(requiredWidth, availableWidth),
    compact: viewportWidth < DESKTOP_NAV_MIN_WIDTH || requiredWidth > availableWidth,
  };
}

export function resolveLandingNavbarExpandedWidth(pillWidth: number, availableWidth: number) {
  return Math.min(
    Math.max(PILL_INITIAL_WIDTH, pillWidth + PILL_EXPANDED_EXTRA_WIDTH),
    availableWidth,
  );
}

export default function LandingNavbar({
  audience = 'solo',
}: LandingNavbarProps) {
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();
  const [platformOpen, setPlatformOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isCompactNav, setIsCompactNav] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < DESKTOP_NAV_MIN_WIDTH,
  );
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLAnchorElement | null>(null);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  // Locale decides how wide the pill has to be: "Start for free" and
  // "Essayer gratuitement" are not the same bar. Measure the real rendered
  // groups instead of guessing, so no locale wraps to a second row.
  const [pillMaxWidth, setPillMaxWidth] = useState(PILL_INITIAL_WIDTH);
  const [expandedMaxWidth, setExpandedMaxWidth] = useState(PILL_INITIAL_WIDTH);

  const measurePill = useCallback(() => {
    const brand = brandRef.current;
    const links = linksRef.current;
    const actions = actionsRef.current;
    if (!brand || !links || !actions) return;
    const natural =
      brand.offsetWidth +
      PILL_BRAND_GAP +
      links.scrollWidth +
      PILL_GROUP_GAP +
      actions.scrollWidth +
      PILL_PADDING;
    const layout = resolveLandingNavbarLayout(natural, window.innerWidth);
    setPillMaxWidth(layout.pillWidth);
    setExpandedMaxWidth(resolveLandingNavbarExpandedWidth(layout.pillWidth, layout.availableWidth));
    setIsCompactNav(layout.compact);
  }, []);

  // Re-measure when the labels change, and again once the display webfont
  // swaps in — text metrics shift under us otherwise.
  useLayoutEffect(() => {
    measurePill();
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measurePill();
    });
    window.addEventListener('resize', measurePill);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measurePill);
    };
  }, [measurePill, locale, platform, audience]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPlatformOpen(false);
      }
    }
    function handleScroll() {
      setScrolled(window.scrollY > 40);
    }
    handleScroll();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (isCompactNav) setPlatformOpen(false);
    else setMobileOpen(false);
  }, [isCompactNav]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const isSchools = platform === 'schools' || platform === 'teachers';
  const orgAdminLoginHref = buildLocalizedPath('/login', locale);
  const brandName = isSchools ? t('nav.brandSchools') : 'Tutlio';
  const dropdownLabel = t('landing.footerSolutions');
  const solutionLinks: SolutionLinkItem[] = [
    { key: 'tutors', href: buildLocalizedPath(landingPathForAudience('solo'), locale), label: t('nav.forTutors'), samePlatform: !isSchools },
    { key: 'agencies', href: buildLocalizedPath(landingPathForAudience('biz'), locale), label: t('nav.forAgencies'), samePlatform: !isSchools },
    { key: 'schools', href: isSchools ? buildLocalizedPath('/', locale) : schoolsLandingHref(locale), label: t('nav.forSchools'), samePlatform: isSchools },
  ];
  const isAgency = audience === 'agency';
  const pricingHref = `${buildLocalizedPath('/pricing', locale)}?audience=${audience}`;
  const primaryCtaLabel = t(isAgency ? 'pricing.bookDemo' : 'landing.startFree');

  const navLinks = [
    { to: buildLocalizedPath(localizedPagePath('about', locale), locale), label: t('nav.aboutUs') },
    { to: buildLocalizedPath('/features', locale), label: t('nav.features') },
    { to: buildLocalizedPath('/pricing', locale), label: t('common.prices') },
    { to: buildLocalizedPath(localizedPagePath('contacts', locale), locale), label: t('common.contacts') },
  ];

  const showPill = scrolled && !isCompactNav;

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 ${showPill ? '' : isCompactNav ? '' : 'bg-white'}`}>
        <div
          className="mx-auto flex items-center"
          style={{
            maxWidth: isCompactNav ? 'none' : showPill ? pillMaxWidth : expandedMaxWidth,
            height: showPill ? 52 : (isCompactNav ? 60 : 72),
            padding: showPill ? '0 20px' : '0 20px',
            margin: showPill ? '10px auto' : '0 auto',
            backgroundColor: showPill ? 'rgba(255,255,255,0.82)' : isCompactNav ? '#ffffff' : 'transparent',
            backdropFilter: showPill ? 'blur(20px) saturate(1.4)' : 'none',
            WebkitBackdropFilter: showPill ? 'blur(20px) saturate(1.4)' : 'none',
            borderRadius: showPill ? 9999 : 0,
            boxShadow: showPill ? '0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' : 'none',
            border: showPill ? '1px solid rgba(255,255,255,0.7)' : '1px solid transparent',
            transition: 'max-width 0.6s cubic-bezier(0.22,1,0.36,1), height 0.5s cubic-bezier(0.22,1,0.36,1), padding 0.5s cubic-bezier(0.22,1,0.36,1), margin 0.5s cubic-bezier(0.22,1,0.36,1), background-color 0.4s ease, backdrop-filter 0.4s ease, border-radius 0.6s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease, border-color 0.4s ease',
          }}
        >
          <Link ref={brandRef} to={buildLocalizedPath('/', locale)} className="flex items-center gap-2 shrink-0 whitespace-nowrap" onClick={() => setMobileOpen(false)}>
            <img src="/logo-icon.png" alt="Tutlio" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-gray-900 tracking-tight text-[15px]">{brandName}</span>
          </Link>

          {/* Desktop nav. shrink-0 + nowrap keep every locale on one row; the
              pill is measured to fit rather than the labels squeezed to fit. */}
          <div
            ref={linksRef}
            inert={isCompactNav ? true : undefined}
            aria-hidden={isCompactNav}
            className={`flex w-max items-center gap-6 ms-8 shrink-0 ${isCompactNav ? 'invisible fixed -left-[10000px] top-0 pointer-events-none' : ''}`}
          >
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors font-medium whitespace-nowrap">
                {link.label}
              </Link>
            ))}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setPlatformOpen(v => !v)}
                className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-900 transition-colors font-medium whitespace-nowrap"
              >
                {dropdownLabel}
                <ChevronDown className={`w-3 h-3 transition-transform ${platformOpen ? 'rotate-180' : ''}`} />
              </button>
              {platformOpen && (
                <div className="absolute start-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  {solutionLinks.map((link) => (
                    <SolutionLink
                      key={link.key}
                      link={link}
                      onNavigate={() => setPlatformOpen(false)}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            ref={actionsRef}
            inert={isCompactNav ? true : undefined}
            aria-hidden={isCompactNav}
            className={`flex w-max items-center gap-3 ms-auto shrink-0 ${isCompactNav ? 'invisible fixed -left-[10000px] top-0 pointer-events-none' : ''}`}
          >
            <div>
              <LanguageSelector />
            </div>
            <Link to={orgAdminLoginHref} className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors font-medium whitespace-nowrap">
              {t('common.login')}
            </Link>
            <NavbarAudienceCta
              href={pricingHref}
              label={primaryCtaLabel}
              className="flex rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold items-center whitespace-nowrap transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98] h-[34px] px-4 text-[12px]"
            />
          </div>

          {isCompactNav && (
            <div className="ms-auto flex items-center gap-3 shrink-0">
              <NavbarAudienceCta
                href={pricingHref}
                label={primaryCtaLabel}
                className="hidden sm:flex rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold items-center whitespace-nowrap transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98] h-[34px] px-4 text-[12px]"
              />

              <button
                type="button"
                onClick={() => setMobileOpen(v => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
                aria-label="Menu"
              >
                {mobileOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile overlay */}
      <div
        className={`${isCompactNav ? '' : 'hidden'} fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Mobile drawer */}
      <div
        inert={!isCompactNav || !mobileOpen ? true : undefined}
        aria-hidden={!isCompactNav || !mobileOpen}
        className={`${isCompactNav ? '' : 'hidden'} fixed top-0 right-0 z-50 h-full w-[280px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-[60px] border-b border-gray-100">
          <span className="font-bold text-gray-900 text-[15px]">{brandName}</span>
          <button type="button" onClick={() => setMobileOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors" aria-label="Close menu">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-[15px] text-gray-700 font-medium hover:text-gray-900 transition-colors border-b border-gray-50"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{dropdownLabel}</p>
            {solutionLinks.map((link) => (
              <SolutionLink
                key={link.key}
                link={link}
                onNavigate={() => setMobileOpen(false)}
                className="block w-full text-left py-2.5 text-[14px] text-gray-600 hover:text-gray-900 transition-colors"
              />
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <LanguageSelector />
          </div>
        </div>

        <div className="px-5 py-5 border-t border-gray-100 space-y-3">
          <Link
            to={orgAdminLoginHref}
            onClick={() => setMobileOpen(false)}
            className="block w-full text-center py-2.5 text-[14px] font-medium text-gray-700 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {t('common.login')}
          </Link>
          <NavbarAudienceCta
            href={pricingHref}
            label={primaryCtaLabel}
            onNavigate={() => setMobileOpen(false)}
            className="block w-full text-center py-2.5 text-[14px] font-semibold text-white bg-[#4f46e5] hover:bg-[#4338ca] rounded-full transition-colors"
          />
        </div>
      </div>
    </>
  );
}
