import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { LOCALE_LABELS, LOCALE_NAMES, type Locale } from '@/lib/i18n';
import { selectableLocales } from '@/lib/i18n/localeRelease';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildLocalizedPath } from '@/lib/i18n';
import { isPlMarket } from '@/lib/market';

function LanguageSelectorInner() {
  const { locale, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        aria-label={t('common.selectLanguage')}
        aria-expanded={open}
      >
        <Globe className="w-4 h-4" />
        <span>{LOCALE_LABELS[locale]}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 h-80 max-h-[60dvh] overflow-y-auto overscroll-contain bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          {selectableLocales(import.meta.env.DEV).map((loc: Locale) => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                setLocale(loc);
                const localizedPath = buildLocalizedPath(location.pathname, loc);
                // A prefix-free domain default must not inherit a conflicting
                // language query from an invitation or another localized URL.
                const params = new URLSearchParams(location.search);
                let search = location.search;
                if (params.has('lang')) {
                  params.set('lang', loc);
                  search = `?${params.toString()}`;
                }
                const nextUrl = `${localizedPath}${search}${location.hash}`;
                navigate(nextUrl, { replace: true });
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                loc === locale
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="font-mono text-xs min-w-12 shrink-0">{LOCALE_LABELS[loc]}</span>
              <span className="flex-1 text-start"><bdi>{LOCALE_NAMES[loc]}</bdi></span>
              {loc === locale && <Check className="w-4 h-4 text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hidden on tutlio.pl — Polish-only market. */
export default function LanguageSelector() {
  if (isPlMarket()) return null;
  return <LanguageSelectorInner />;
}
