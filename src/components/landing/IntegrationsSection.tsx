import { Link } from 'react-router-dom';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import Reveal from './Reveal';
import type { LandingVariant } from './HeroSection';

const INTEGRATIONS = [
  { src: '/integrations/google-calendar.svg', alt: 'Google Calendar', size: 'w-12 h-12', y: '-translate-y-3', rotate: '-rotate-3' },
  { src: '/integrations/google-meet.svg', alt: 'Google Meet', size: 'w-11 h-11', y: 'translate-y-2', rotate: 'rotate-2' },
  { src: '/integrations/stripe.svg', alt: 'Stripe', size: 'w-14 h-14', y: '-translate-y-1', rotate: 'rotate-1' },
  { src: '/integrations/zoom.svg', alt: 'Zoom', size: 'w-11 h-11', y: 'translate-y-4', rotate: '-rotate-2' },
  { src: '/integrations/google-drive.svg', alt: 'Google Drive', size: 'w-12 h-12', y: '-translate-y-2', rotate: 'rotate-3' },
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
          <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap max-w-xl mx-auto">
            {INTEGRATIONS.map((integ, i) => (
              <div
                key={i}
                className={`${integ.size} ${integ.y} ${integ.rotate} rounded-2xl bg-white flex items-center justify-center shadow-md border border-gray-100 animate-float p-2`}
                style={{ animationDelay: `${i * 0.6}s`, animationDuration: `${5 + (i % 3)}s` }}
              >
                <img src={integ.src} alt={integ.alt} className="w-full h-full object-contain" />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
