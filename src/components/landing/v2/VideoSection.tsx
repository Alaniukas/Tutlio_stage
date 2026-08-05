import { useEffect, useRef, useState } from 'react';
import { Clock, Play } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import Reveal from '../Reveal';
import { DEMO_VIDEO_ID, DEMO_VIDEO_LENGTH, SHOW_PLACEHOLDER_SOCIAL_PROOF } from './socialProof';

/** Rest pose while the frame is still below the fold; it flattens to 0/1 as it rises. */
const MAX_TILT_DEG = 12;
const MIN_SCALE = 0.95;

/**
 * Scroll-driven tilt: the frame starts leaning back and straightens as it
 * scrolls toward the middle of the viewport. Returns 0 (fully tilted) → 1 (flat).
 */
function useFlattenProgress(ref: React.RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const raw = (vh - rect.top) / (vh * 0.9);
      setProgress(Math.min(Math.max(raw, 0), 1));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref]);

  return progress;
}

export default function VideoSection() {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const progress = useFlattenProgress(frameRef);

  if (!DEMO_VIDEO_ID && !SHOW_PLACEHOLDER_SOCIAL_PROOF) return null;

  const tilt = MAX_TILT_DEG * (1 - progress);
  const scale = MIN_SCALE + (1 - MIN_SCALE) * progress;

  return (
    <section className="relative bg-zinc-50">
      <div className="relative mx-auto w-full max-w-[1224px] px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex w-full flex-col gap-6 sm:gap-8 lg:gap-10">
          <Reveal>
            <div className="mx-auto flex w-full max-w-[700px] flex-col items-center gap-3 sm:gap-4">
              <h2 className="text-center font-display text-2xl font-semibold leading-[1.3] tracking-[-0.5px] text-zinc-900 sm:text-[32px] sm:tracking-[-1px] lg:text-[40px]">
                {t('landing.v2.videoTitle')}
              </h2>
              <h3 className="text-center text-[15px] font-normal leading-[1.6] text-zinc-600 sm:text-base">
                {t('landing.v2.videoSub')}
              </h3>
            </div>
          </Reveal>

          <div ref={frameRef} className="mx-auto w-full max-w-[1100px]" style={{ perspective: '1200px' }}>
            <div style={{ transformOrigin: 'center center', transform: `scale(${scale}) rotateX(${tilt}deg)` }}>
              <div
                className="group relative w-full overflow-hidden rounded-2xl bg-zinc-900 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-shadow duration-300 hover:shadow-[0_20px_50px_rgb(0,0,0,0.15)] sm:rounded-3xl"
                style={{ aspectRatio: '1800 / 1074' }}
              >
                {playing && DEMO_VIDEO_ID ? (
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}?autoplay=1`}
                    title={t('landing.v2.videoTitle')}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    disabled={!DEMO_VIDEO_ID}
                    aria-label={t('landing.v2.videoTitle')}
                    className="absolute inset-0 flex cursor-pointer items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <img
                      src="/landing/dashboard.png"
                      alt={t('landing.dashboardAlt')}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10 transition-opacity duration-300 group-hover:opacity-70" />
                    <span className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:bg-white sm:h-20 sm:w-20">
                      <Play className="ml-1 h-7 w-7 fill-zinc-900 text-zinc-900 sm:h-8 sm:w-8" />
                    </span>
                    <span aria-hidden className="absolute z-0 h-16 w-16 animate-ping rounded-full bg-white/30 sm:h-20 sm:w-20" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {DEMO_VIDEO_ID ? `${DEMO_VIDEO_LENGTH} · ${t('landing.v2.videoWatch')}` : t('landing.v2.videoWatch')}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
