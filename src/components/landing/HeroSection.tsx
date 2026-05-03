import { Link } from 'react-router-dom';
import { Building2, CalendarDays, ListOrdered, Users } from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import Reveal from './Reveal';

export type LandingVariant = 'tutor' | 'schools';

/** `invert:false` — spalvotas logotipas violetiniame marquee (nebenaudojamas brightness/invert maršalas). */
const CUSTOMER_LOGOS: { src: string; alt: string; invert?: boolean }[] = [
  { src: '/wyzant-logo-reversed2x.png', alt: 'Wyzant' },
  { src: '/672a303d02b19dab2f248fd9_iTutor-logo.svg', alt: 'iTutor' },
  { src: '/hey_tutor_logo_2026.webp', alt: 'HeyTutor' },
  { src: '/602428438327a78cb4e7fcb3_learnerlogo.svg', alt: 'Learner' },
  { src: '/67cab891e121bff1e23d95eb_66ad096240b243e78bd71431_Fullmind-logo-plum-on-clear (1) 1.png', alt: 'Fullmind' },
  { src: '/moku-moku-logo.png', alt: 'Moku Moku', invert: false },
  { src: '/logo.png', alt: 'Tutlio' },
  { src: '/tut_logo.svg', alt: 'Tut' },
];

const HERO_SPOT_ICONS_TUTOR = [CalendarDays, ListOrdered] as const;
const HERO_SPOT_ICONS_SCHOOLS = [Building2, Users] as const;

function scrollToFeaturesSection() {
  document.getElementById('tutlio-privalumai')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function HeroSection({ variant = 'tutor' }: { variant?: LandingVariant }) {
  const { t, locale } = useTranslation();
  const p = variant === 'schools' ? 'schoolsLanding' : 'landing';
  const ctaLink = variant === 'schools' ? buildLocalizedPath('/kontaktai', locale) : '/register';
  const spotIcons = variant === 'schools' ? HERO_SPOT_ICONS_SCHOOLS : HERO_SPOT_ICONS_TUTOR;

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#f5f5f3] via-[#f0efed] to-[#eae9e6]">
      <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-white/40 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto px-5 sm:px-6 pt-8 sm:pt-10 lg:pt-14 pb-12 sm:pb-16 lg:pb-20 text-center">
        <Reveal>
          <div className="flex items-end justify-center gap-2 sm:gap-3 mb-7 sm:mb-10">
            <span
              className="px-5 py-1 bg-[#86efac] text-gray-800 text-[12px] font-semibold shadow-sm"
              style={{ borderRadius: '20px 8px 20px 8px', transform: 'rotate(-2deg) translateY(-4px)' }}
            >
              {t(`${p}.tag.${variant === 'schools' ? '1' : 'calendar'}`)}
            </span>
            <span
              className="px-4 py-1.5 bg-[#334155] text-white text-[12px] font-semibold shadow-sm"
              style={{ borderRadius: '10px', transform: 'translateY(2px)' }}
            >
              {t(`${p}.tag.${variant === 'schools' ? '2' : 'waitlist'}`)}
            </span>
            <span
              className="px-5 py-1 bg-[#fca5a5] text-gray-800 text-[12px] font-semibold shadow-sm"
              style={{ borderRadius: '8px 18px 8px 18px', transform: 'rotate(2deg) translateY(-6px)' }}
            >
              {t(`${p}.tag.${variant === 'schools' ? '3' : 'payments'}`)}
            </span>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <h1 className="font-display text-[1.75rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[4rem] xl:text-[4.5rem] text-gray-900 leading-[1.1] mb-4 sm:mb-6 max-w-[750px] mx-auto font-bold tracking-tight">
            {t(`${p}.heroTitle`)}{t(`${p}.heroTitleHighlight`)}
          </h1>
        </Reveal>

        <Reveal delay={200}>
          <p className="text-[14px] sm:text-[15px] lg:text-base text-gray-500 mb-8 sm:mb-10 max-w-[460px] mx-auto leading-relaxed px-2 sm:px-0">
            {t(`${p}.heroSubtitle`)}
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="flex justify-center">
            <Link
              to={ctaLink}
              className="inline-flex items-center justify-center h-11 sm:h-12 px-7 sm:px-8 text-[13px] sm:text-sm rounded-full bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
            >
              {t(`${p}.heroCta`)}
            </Link>
          </div>
        </Reveal>

        <Reveal delay={400}>
          <div className="mt-12 sm:mt-14 mx-auto w-full max-w-md border-t border-gray-300/50 pt-10 sm:pt-12">
            <ul className="space-y-6 text-left" aria-label={t(`${p}.heroSpotAria`)}>
              {spotIcons.map((Icon, idx) => {
                const n = idx + 1;
                return (
                  <li key={n} className="flex gap-3.5">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200/90 bg-white/70 text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-semibold text-gray-900">{t(`${p}.heroSpot${n}Title`)}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{t(`${p}.heroSpot${n}Body`)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={scrollToFeaturesSection}
                className="inline-flex items-center justify-center h-10 sm:h-11 px-6 text-[13px] sm:text-sm rounded-full border border-gray-300/90 bg-white/80 font-medium text-gray-700 hover:bg-white hover:border-gray-400 transition-all duration-200 active:scale-[0.98] touch-manipulation"
              >
                {t(`${p}.heroMoreFeaturesCta`)}
              </button>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="bg-[#4f46e5] py-5 sm:py-7 overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
          <p className="text-center text-indigo-200 text-[12px] mb-5 tracking-wide uppercase font-medium">
            {t(`${p}.trustText`)}
          </p>
        </div>
        <div className="relative overflow-hidden logo-carousel-mask">
          <div className="animate-marquee flex w-max">
            {[0, 1].map((setIdx) => (
              <div key={setIdx} className="flex items-center gap-16 sm:gap-20 shrink-0 pr-16 sm:pr-20">
                {CUSTOMER_LOGOS.map((logo, i) => (
                  <img
                    key={i}
                    src={logo.src}
                    alt={logo.alt}
                    className={
                      logo.invert === false
                        ? 'h-9 sm:h-10 w-auto max-w-[140px] object-contain opacity-[0.98] select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]'
                        : 'h-6 sm:h-7 w-auto object-contain brightness-0 invert opacity-60 select-none'
                    }
                    draggable={false}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
