import { useTranslation } from '@/lib/i18n';
import { CUSTOMER_LOGOS } from '@/lib/landingLogos';

export default function LogoWall() {
  const { t } = useTranslation();

  return (
    <section className="bg-zinc-50">
      <div className="mx-auto flex w-full max-w-[1224px] flex-col items-center gap-4 px-5 py-16 sm:gap-5 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <h2 className="text-center font-display text-lg font-semibold tracking-[-0.5px] text-zinc-900 sm:text-xl lg:text-2xl">
          {t('landing.trustText')}
        </h2>

        <div className="relative w-full overflow-hidden py-4 logo-carousel-mask">
          <div className="flex w-max animate-marquee items-center">
            {[0, 1].map((setIdx) => (
              <div key={setIdx} className="flex shrink-0 items-center gap-10 pr-10 sm:gap-16 sm:pr-16 lg:gap-20 lg:pr-20">
                {CUSTOMER_LOGOS.map((logo) => (
                  <img
                    key={`${setIdx}-${logo.alt}`}
                    src={logo.src}
                    alt={logo.alt}
                    draggable={false}
                    loading="lazy"
                    className="h-8 w-auto max-w-[140px] select-none object-contain opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:h-10 lg:h-12"
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-zinc-50 to-transparent sm:w-16" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-zinc-50 to-transparent sm:w-16" />
        </div>
      </div>
    </section>
  );
}
