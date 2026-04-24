import { Link } from 'react-router-dom';
import { GraduationCap, AppWindow, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';
import LanguageSelector from '@/components/LanguageSelector';
import { usePlatform } from '@/contexts/PlatformContext';
import { useEffect, useRef, useState } from 'react';

function navigateToPlatform(platform: 'tutors' | 'schools', locale: string) {
  const localeSegment = locale === 'lt' ? '' : `/${locale}`;
  const prefix = platform === 'tutors' ? '' : `/${platform}`;
  window.location.href = `${prefix}${localeSegment}` || '/';
}

export default function LandingNavbar() {
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();
  const [platformOpen, setPlatformOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPlatformOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isSchools = platform === 'schools' || platform === 'teachers';
  const brandName = isSchools ? 'Tutlio Schools' : 'Tutlio';

  const dropdownLabel = isSchools
    ? (locale === 'lt' ? 'Mokykloms' : 'Schools')
    : (locale === 'lt' ? 'Korepetitoriai' : 'Tutors');

  return (
    <nav className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-b border-indigo-50 z-50 flex items-center">
      <div className="max-w-6xl mx-auto px-4 w-full flex items-center justify-between">
        <Link to={buildLocalizedPath('/', locale)} className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <span className="font-black text-xl text-gray-900 tracking-tight">{brandName}</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-6">
          <div className="hidden md:flex items-center gap-6">
            <Link to={buildLocalizedPath('/apie-mus', locale)} className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
              {t('nav.aboutUs')}
            </Link>
            <Link to={buildLocalizedPath('/pricing', locale)} className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
              {t('common.prices')}
            </Link>
            <Link to={buildLocalizedPath('/kontaktai', locale)} className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
              {t('common.contacts')}
            </Link>

            {/* Platform dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setPlatformOpen(v => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors"
              >
                {dropdownLabel}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${platformOpen ? 'rotate-180' : ''}`} />
              </button>

              {platformOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <button
                    type="button"
                    onClick={() => { setPlatformOpen(false); navigateToPlatform('tutors', locale); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-800"
                  >
                    {locale === 'lt' ? 'Korepetitoriai' : 'Tutors'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPlatformOpen(false); navigateToPlatform('schools', locale); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-800"
                  >
                    {locale === 'lt' ? 'Mokykloms' : 'Schools'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <LanguageSelector />

          <Link to={isSchools ? '/school/login' : '/login'}>
            <Button className="rounded-xl px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wide shadow-md shadow-indigo-200 gap-2">
              {t('common.login')}
              <AppWindow className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
