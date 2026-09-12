import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadPublicLandingLessonCount } from '@/lib/landingStats';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import { marketingAudienceFromLanding } from '@/lib/marketingAudience';
import type { LandingAudience } from './audience';
import HeroAnimation from './HeroAnimation';
import TabletFrame from './TabletFrame';

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!value || started.current) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - t0) / 2000, 1);
          setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{display.toLocaleString()}</span>;
}

export default function HeroSection({ audience }: { audience: LandingAudience }) {
  const { t, locale } = useTranslation();
  const isSolo = audience === 'solo';

  const [lessonCount, setLessonCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const stop = loadPublicLandingLessonCount((n) => {
      if (!cancelled) setLessonCount(n);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const ctaHref = `${buildLocalizedPath('/pricing', locale)}?audience=${marketingAudienceFromLanding(audience)}`;

  return (
    <section className="bg-white">
      <div className="mx-auto w-full max-w-[1224px] px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16 xl:gap-20">
          <div className="flex flex-1 flex-col items-center gap-5 text-center sm:gap-6 lg:items-start lg:text-start">
            <h1 className="font-display text-[32px] font-bold leading-[1.15] tracking-[-1.5px] text-zinc-900 sm:text-[40px] lg:text-[50px] lg:tracking-[-2px] rtl:tracking-normal">
              {t(isSolo ? 'landing.v2.heroTitleSolo' : 'landing.v2.heroTitleBiz')}
              <span className="text-zinc-900">
                {t(isSolo ? 'landing.v2.heroTitleSoloHighlight' : 'landing.v2.heroTitleBizHighlight')}
              </span>
            </h1>

            <p className="max-w-[540px] text-[15px] leading-[1.7] text-zinc-600 sm:text-base lg:max-w-none">
              {t(isSolo ? 'landing.v2.heroSubSolo' : 'landing.v2.heroSubBiz')}
            </p>

            <div className="flex flex-col items-center gap-4 pt-1 sm:flex-row lg:justify-start">
              <Link
                to={ctaHref}
                className="inline-block w-fit rounded-lg bg-zinc-900 px-7 py-3.5 text-center font-semibold text-white transition-colors hover:bg-zinc-800 sm:px-8 sm:py-4"
              >
                {t(isSolo ? 'landing.v2.heroCtaSolo' : 'landing.v2.heroCtaBiz')}
              </Link>
              {isSolo && (
                <span className="text-sm text-zinc-500">{t('landing.v2.heroTrial')}</span>
              )}
            </div>

            {lessonCount !== null && lessonCount > 0 && (
              <p className="text-[13px] text-zinc-400 sm:text-sm">
                <span className="font-bold tabular-nums text-zinc-900"><AnimatedCount value={lessonCount} /></span>{' '}
                {t('landing.heroLessonCount')}
              </p>
            )}
          </div>

          <div className="mx-auto w-full max-w-[320px] sm:max-w-[360px] lg:mx-0 lg:w-[380px] lg:max-w-none xl:w-[400px]">
            <div className="aspect-[5/6]">
              <TabletFrame>
                <HeroAnimation audience={audience} />
              </TabletFrame>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
