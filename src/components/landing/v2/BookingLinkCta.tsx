import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Link2, Pause, Play } from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';

const SLOTS = ['Pn 16:00', 'An 17:30', 'Kt 18:00'];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Browser vignette: a student opens the shared booking link, picks a slot and
 * the lesson is confirmed. Four steps, looping. Static at the final step under
 * prefers-reduced-motion.
 */
function BookingAnimation() {
  const reducedMotion = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reducedMotion || !playing) return;
    timer.current = window.setInterval(() => setStep((s) => (s + 1) % 4), 1500);
    return () => window.clearInterval(timer.current);
  }, [reducedMotion, playing]);

  const active = reducedMotion ? 3 : step;
  const picked = active >= 2 ? 1 : -1;
  const confirmed = active >= 3;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl"
      style={{
        background:
          'linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px) 0 0 / 32px 100%, linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -bottom-20 h-72 w-72 rounded-full blur-[60px]"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.20) 0%, transparent 70%)' }}
      />

      <div className="relative flex w-[86%] max-w-[380px] flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)]">
        <div className="flex h-9 items-center gap-2 border-b border-gray-100 px-3">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="ml-2 flex h-5 flex-1 items-center gap-1 rounded border border-gray-200 bg-gray-100 px-2 text-[9px] text-gray-400">
            <Link2 className="h-2.5 w-2.5" />
            tutlio.lt/book/…
          </span>
        </div>

        <div className="flex flex-col gap-3 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-full bg-indigo-100" />
            <span className="h-2.5 w-24 rounded-full bg-gray-200" />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {SLOTS.length} · 60 min
            </div>
            <div className="flex flex-col gap-1.5">
              {SLOTS.map((slot, i) => (
                <div
                  key={slot}
                  className={`flex items-center justify-between rounded-md border px-2.5 py-2 text-[11px] font-medium transition-all duration-300 ${
                    i === picked
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  <span>{slot}</span>
                  {i === picked && <span className="text-[9px] font-bold uppercase">✓</span>}
                </div>
              ))}
            </div>
          </div>

          <div
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition-all duration-300 ${
              confirmed ? 'bg-emerald-500 text-white' : 'bg-zinc-900 text-white'
            }`}
          >
            {confirmed && <CalendarCheck className="h-3.5 w-3.5" />}
            {confirmed ? '✓' : '→'}
          </div>
        </div>

        {!reducedMotion && (
          <div
            aria-hidden
            className="pointer-events-none absolute right-8 drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-all duration-500 ease-out"
            style={{ top: active >= 3 ? '86%' : active >= 1 ? '62%' : '40%' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
                fill="#111827"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {!reducedMotion && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          className="absolute bottom-4 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg transition-colors hover:bg-white"
        >
          {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        </button>
      )}
    </div>
  );
}

export default function BookingLinkCta() {
  const { t, locale } = useTranslation();

  return (
    <section className="bg-zinc-50">
      <div className="mx-auto w-full max-w-[1224px] px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-between lg:gap-12 xl:gap-16">
          <div className="flex max-w-[480px] flex-col gap-5 text-center sm:gap-6 lg:text-left">
            <div className="mx-auto inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 lg:mx-0">
              <Link2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="text-sm font-medium text-zinc-700">{t('landing.v2.linkBadge')}</span>
            </div>

            <div className="flex flex-col gap-2 sm:gap-3">
              <h2 className="font-display text-xl font-semibold leading-[1.35] text-zinc-900 sm:text-2xl">
                {t('landing.v2.linkTitle')}
              </h2>
              <p className="text-[15px] font-normal leading-[1.6] text-zinc-600 sm:text-base">
                {t('landing.v2.linkSub')}
              </p>
            </div>

            <Link
              to={buildLocalizedPath('/register', locale)}
              className="mx-auto inline-block w-fit rounded-lg bg-zinc-900 px-7 py-3.5 font-semibold text-white transition-colors hover:bg-zinc-800 sm:px-8 sm:py-4 lg:mx-0"
            >
              {t('landing.v2.linkCta')}
            </Link>
          </div>

          <div className="w-full max-w-[400px] sm:max-w-[460px] lg:w-[480px] lg:max-w-none">
            <div className="aspect-[500/460]">
              <BookingAnimation />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
