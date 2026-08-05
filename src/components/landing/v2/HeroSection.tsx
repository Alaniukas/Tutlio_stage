import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import HeroAnimation from './HeroAnimation';

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

export default function HeroSection() {
  const { t, locale } = useTranslation();

  const [lessonCount, setLessonCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_public_landing_stats').then(({ data }) => {
      if (cancelled || !data) return;
      const d = data as { completed_lessons: number; upcoming_lessons: number };
      setLessonCount(d.completed_lessons + d.upcoming_lessons);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="bg-white">
      <div className="mx-auto w-full max-w-[1224px] px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16 xl:gap-20">
          <div className="flex flex-1 flex-col items-center gap-5 text-center sm:gap-6 lg:items-start lg:text-left">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2">
              <TriangleAlert className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-700 sm:text-base">{t('landing.v2.heroPill')}</span>
            </div>

            <h1 className="font-display text-[32px] font-bold leading-[1.15] tracking-[-1.5px] text-zinc-900 sm:text-[40px] lg:text-[50px] lg:tracking-[-2px]">
              {t('landing.heroTitle')}{t('landing.heroTitleHighlight')}
            </h1>

            <p className="max-w-[540px] text-[15px] leading-[1.7] text-zinc-600 sm:text-base lg:max-w-none">
              {t('landing.v2.heroSub')}
            </p>

            <div className="flex flex-col items-center gap-4 pt-1 sm:flex-row lg:justify-start">
              <Link
                to={buildLocalizedPath('/pricing', locale)}
                className="inline-block w-fit rounded-lg bg-zinc-900 px-7 py-3.5 text-center font-semibold text-white transition-colors hover:bg-zinc-800 sm:px-8 sm:py-4"
              >
                {t('landing.heroCta')}
              </Link>
              <span className="text-sm text-zinc-500">{t('landing.v2.heroTrial')}</span>
            </div>

            {lessonCount !== null && lessonCount > 0 && (
              <p className="text-[13px] text-zinc-400 sm:text-sm">
                <span className="font-bold tabular-nums text-zinc-900"><AnimatedCount value={lessonCount} /></span>{' '}
                {t('landing.heroLessonCount')}
              </p>
            )}
          </div>

          <div className="w-full max-w-[420px] sm:max-w-[460px] lg:w-[480px] lg:max-w-none xl:w-[500px]">
            <div className="aspect-[500/460]">
              <HeroAnimation />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
