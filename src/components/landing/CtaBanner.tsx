import { Link } from 'react-router-dom';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import Reveal from './Reveal';
import type { LandingVariant } from './HeroSection';

export default function CtaBanner({ variant = 'tutor' }: { variant?: LandingVariant }) {
  const { t, locale } = useTranslation();
  const p = variant === 'schools' ? 'schoolsLanding' : 'landing';
  const ctaLink = variant === 'schools' ? buildLocalizedPath('/kontaktai', locale) : '/register';

  return (
    <section className="py-10 sm:py-16 lg:py-20">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="relative bg-[#0f172a] rounded-2xl sm:rounded-3xl p-7 sm:p-10 md:p-16 overflow-hidden min-h-[280px] sm:min-h-[320px] flex items-center">
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                backgroundSize: '44px 44px',
              }}
            />
            <div className="absolute right-0 bottom-0 w-1/2 h-full pointer-events-none overflow-hidden hidden lg:block">
              <div
                className="absolute bottom-0 right-0 w-full h-full"
                style={{
                  background: 'linear-gradient(135deg, transparent 30%, rgba(79,70,229,0.12) 50%, rgba(79,70,229,0.2) 70%, rgba(67,56,202,0.15) 100%)',
                  borderRadius: '40% 0 0 0',
                }}
              />
              <div
                className="absolute -bottom-16 -right-8 w-[450px] h-[350px]"
                style={{
                  background: 'linear-gradient(160deg, transparent 20%, rgba(99,102,241,0.15) 45%, rgba(79,70,229,0.25) 65%, rgba(67,56,202,0.18) 85%)',
                  borderRadius: '50% 20% 0 40%',
                  filter: 'blur(1px)',
                }}
              />
            </div>

            <div className="relative z-10 max-w-md">
              <h2 className="font-display text-3xl md:text-[2.25rem] text-white leading-snug mb-4 font-bold tracking-tight">
                {t(`${p}.ctaBannerTitle`)}
              </h2>
              <p className="text-gray-400 text-[14px] leading-relaxed mb-8">{t(`${p}.ctaBannerDesc`)}</p>
              <Link
                to={ctaLink}
                className="inline-flex items-center h-11 px-8 rounded-full bg-white text-gray-900 font-semibold text-[13px] hover:bg-gray-100 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
              >
                {t(`${p}.ctaBannerBtn`)}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
