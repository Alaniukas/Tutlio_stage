import { Link } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';
import LanguageSelector from '@/components/LanguageSelector';
import { usePlatform } from '@/contexts/PlatformContext';
import { useEffect, useRef, useState, useCallback } from 'react';

function navigateToPlatform(platform: 'tutors' | 'schools', locale: string) {
  const localeSegment = locale === 'lt' ? '' : `/${locale}`;
  const prefix = platform === 'tutors' ? '' : `/${platform}`;
  window.location.href = `${prefix}${localeSegment}` || '/';
}

export default function LandingNavbar() {
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();
  const [platformOpen, setPlatformOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const checkMobile = useCallback(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPlatformOpen(false);
      }
    }
    function handleScroll() {
      setScrolled(window.scrollY > 40);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', checkMobile);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkMobile);
    };
  }, [checkMobile]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const isSchools = platform === 'schools' || platform === 'teachers';
  const brandName = isSchools ? 'Tutlio Schools' : 'Tutlio';
  const dropdownLabel = isSchools
    ? (locale === 'lt' ? 'Mokykloms' : 'Schools')
    : (locale === 'lt' ? 'Korepetitoriai' : 'Tutors');

  const navLinks = [
    { to: buildLocalizedPath('/apie-mus', locale), label: t('nav.aboutUs') },
    { to: buildLocalizedPath('/pricing', locale), label: t('common.prices') },
    { to: buildLocalizedPath('/kontaktai', locale), label: t('common.contacts') },
  ];

  const showPill = scrolled && !isMobile;

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 ${showPill ? '' : isMobile ? '' : 'bg-[#f5f5f3]'}`}>
        <div
          className="mx-auto flex items-center"
          style={{
            maxWidth: showPill ? 860 : 1200,
            height: showPill ? 52 : (isMobile ? 60 : 72),
            padding: showPill ? '0 20px' : '0 20px',
            margin: showPill ? '10px auto' : '0 auto',
            backgroundColor: showPill ? 'rgba(255,255,255,0.82)' : isMobile ? '#f5f5f3' : 'transparent',
            backdropFilter: showPill ? 'blur(20px) saturate(1.4)' : 'none',
            WebkitBackdropFilter: showPill ? 'blur(20px) saturate(1.4)' : 'none',
            borderRadius: showPill ? 9999 : 0,
            boxShadow: showPill ? '0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' : 'none',
            border: showPill ? '1px solid rgba(255,255,255,0.7)' : '1px solid transparent',
            transition: 'max-width 0.6s cubic-bezier(0.22,1,0.36,1), height 0.5s cubic-bezier(0.22,1,0.36,1), padding 0.5s cubic-bezier(0.22,1,0.36,1), margin 0.5s cubic-bezier(0.22,1,0.36,1), background-color 0.4s ease, backdrop-filter 0.4s ease, border-radius 0.6s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease, border-color 0.4s ease',
          }}
        >
          <Link to={buildLocalizedPath('/', locale)} className="flex items-center gap-2 shrink-0" onClick={() => setMobileOpen(false)}>
            <img src="/logo-icon.png" alt="Tutlio" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-gray-900 tracking-tight text-[15px]">{brandName}</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 ml-8">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors font-medium">
                {link.label}
              </Link>
            ))}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setPlatformOpen(v => !v)}
                className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-900 transition-colors font-medium"
              >
                {dropdownLabel}
                <ChevronDown className={`w-3 h-3 transition-transform ${platformOpen ? 'rotate-180' : ''}`} />
              </button>
              {platformOpen && (
                <div className="absolute left-0 top-full mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <button type="button" onClick={() => { setPlatformOpen(false); navigateToPlatform('tutors', locale); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                    {locale === 'lt' ? 'Korepetitoriai' : 'Tutors'}
                  </button>
                  <button type="button" onClick={() => { setPlatformOpen(false); navigateToPlatform('schools', locale); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                    {locale === 'lt' ? 'Mokykloms' : 'Schools'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <div className="hidden md:block">
              <LanguageSelector />
            </div>
            <Link to="/login" className="hidden md:block text-[13px] text-gray-500 hover:text-gray-900 transition-colors font-medium">
              {t('common.login')}
            </Link>
            <Link
              to="/register"
              className="hidden sm:flex rounded-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold items-center transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98] h-[34px] px-4 text-[12px]"
            >
              {t('landing.startFree')}
            </Link>

            {/* Hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen(v => !v)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Mobile drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-[280px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out md:hidden ${
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
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{locale === 'lt' ? 'Platforma' : 'Platform'}</p>
            <button
              type="button"
              onClick={() => { setMobileOpen(false); navigateToPlatform('tutors', locale); }}
              className="block w-full text-left py-2.5 text-[14px] text-gray-600 hover:text-gray-900 transition-colors"
            >
              {locale === 'lt' ? 'Korepetitoriai' : 'Tutors'}
            </button>
            <button
              type="button"
              onClick={() => { setMobileOpen(false); navigateToPlatform('schools', locale); }}
              className="block w-full text-left py-2.5 text-[14px] text-gray-600 hover:text-gray-900 transition-colors"
            >
              {locale === 'lt' ? 'Mokykloms' : 'Schools'}
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <LanguageSelector />
          </div>
        </div>

        <div className="px-5 py-5 border-t border-gray-100 space-y-3">
          <Link
            to="/login"
            onClick={() => setMobileOpen(false)}
            className="block w-full text-center py-2.5 text-[14px] font-medium text-gray-700 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {t('common.login')}
          </Link>
          <Link
            to="/register"
            onClick={() => setMobileOpen(false)}
            className="block w-full text-center py-2.5 text-[14px] font-semibold text-white bg-[#4f46e5] hover:bg-[#4338ca] rounded-full transition-colors"
          >
            {t('landing.startFree')}
          </Link>
        </div>
      </div>
    </>
  );
}
