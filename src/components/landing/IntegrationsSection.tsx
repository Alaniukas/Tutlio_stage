import { Link } from 'react-router-dom';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import Reveal from './Reveal';
import type { LandingVariant } from './HeroSection';

const ICONS = [
  { label: 'Fi', bg: 'bg-rose-50', text: 'text-rose-400' },
  { label: '#', bg: 'bg-purple-50', text: 'text-purple-400' },
  { label: '✳', bg: 'bg-amber-50', text: 'text-amber-500' },
  { label: 'N', bg: 'bg-gray-100', text: 'text-gray-500' },
  { label: '⟰', bg: 'bg-gray-900', text: 'text-white' },
  { label: 'G', bg: 'bg-emerald-50', text: 'text-emerald-500' },
  { label: '◆', bg: 'bg-sky-50', text: 'text-sky-500' },
  { label: '⊕', bg: 'bg-purple-50', text: 'text-purple-400' },
  { label: 'D', bg: 'bg-gray-100', text: 'text-gray-400' },
];

export default function IntegrationsSection({ variant = 'tutor' }: { variant?: LandingVariant }) {
  const { t, locale } = useTranslation();
  const p = variant === 'schools' ? 'schoolsLanding' : 'landing';
  const ctaLink = variant === 'schools' ? buildLocalizedPath('/kontaktai', locale) : undefined;

  return (
    <section className="relative py-16 sm:py-24 lg:py-32 bg-white overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
        <div className="w-[700px] h-[700px] rounded-full border border-gray-200" />
        <div className="absolute w-[500px] h-[500px] rounded-full border border-gray-200" />
        <div className="absolute w-[300px] h-[300px] rounded-full border border-gray-200" />
      </div>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 text-center relative z-10">
        <Reveal>
          <span className="inline-block px-4 py-1 rounded-full border border-gray-200 text-[12px] font-semibold text-gray-500 mb-5 tracking-wide uppercase">
            {t(`${p}.integBadge`)}
          </span>
          <h2 className="font-display text-3xl md:text-[2.5rem] lg:text-[3rem] text-gray-900 leading-tight mb-4 font-bold tracking-tight max-w-2xl mx-auto">
            {t(`${p}.integTitle`)}
            <span className="text-emerald-500">{t(`${p}.integHighlight`)}</span>
            {t(`${p}.integTitle2`)}
          </h2>
          <p className="text-gray-500 mb-10 max-w-md mx-auto text-[15px] leading-relaxed">{t(`${p}.integDesc`)}</p>
        </Reveal>

        <Reveal delay={150}>
          {ctaLink ? (
            <div className="mb-16">
              <Link
                to={ctaLink}
                className="inline-flex items-center h-11 px-8 rounded-full bg-[#4f46e5] text-white font-semibold text-[13px] hover:bg-[#4338ca] transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
              >
                {t(`${p}.integCta`)}
              </Link>
            </div>
          ) : (
            <div className="flex items-center max-w-sm mx-auto mb-16 rounded-full overflow-hidden bg-white border border-gray-200 shadow-sm">
              <input
                type="email"
                placeholder={t(`${p}.integEmail`)}
                className="flex-1 h-11 px-5 text-sm text-gray-600 placeholder-gray-400 bg-transparent focus:outline-none"
                readOnly
              />
              <button className="h-11 px-6 bg-[#4f46e5] text-white font-semibold text-[13px] hover:bg-[#4338ca] transition-all duration-200 rounded-full -ml-1 hover:scale-[1.03] active:scale-[0.98]">
                {t(`${p}.integCta`)}
              </button>
            </div>
          )}
        </Reveal>

        <Reveal delay={300}>
          <div className="flex items-center justify-center gap-3 flex-wrap max-w-lg mx-auto">
            {ICONS.map((ic, i) => (
              <div
                key={i}
                className={`${i === 4 ? 'w-14 h-14' : i % 3 === 0 ? 'w-11 h-11' : 'w-10 h-10'} ${ic.bg} rounded-full flex items-center justify-center shadow-sm border border-white animate-float`}
                style={{ animationDelay: `${i * 0.4}s`, animationDuration: `${5 + (i % 3)}s` }}
              >
                <span className={`${ic.text} font-bold ${i === 4 ? 'text-sm' : 'text-xs'}`}>{ic.label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
