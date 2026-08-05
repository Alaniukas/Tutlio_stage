import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const ROWS = [
  { initials: 'EM', name: 'Emilija M.', tone: 'bg-indigo-100 text-indigo-700' },
  { initials: 'LK', name: 'Lukas K.', tone: 'bg-emerald-100 text-emerald-700' },
  { initials: 'SG', name: 'Sofija G.', tone: 'bg-amber-100 text-amber-700' },
];

/** Vertical offset of each row's status pill, as a % of the card height. */
const ROW_CURSOR_TOP = [58, 70, 82];

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
 * Hero product vignette: a tutor marks attendance and the rows flip one by one.
 * Loops until paused. Static (all rows marked) under prefers-reduced-motion.
 */
export default function HeroAnimation() {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const [marked, setMarked] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reducedMotion || !playing) return;
    timer.current = window.setInterval(() => {
      setMarked((m) => (m >= ROWS.length ? 0 : m + 1));
    }, 1400);
    return () => window.clearInterval(timer.current);
  }, [reducedMotion, playing]);

  const activeRow = Math.min(marked, ROWS.length - 1);
  const showAll = reducedMotion;

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
        className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full blur-[60px]"
        style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.22) 0%, transparent 70%)' }}
      />

      <div className="relative w-[86%] max-w-[360px] rounded-2xl bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)]">
        <div className="border-b border-gray-100 pb-4">
          <div className="text-[15px] font-semibold text-gray-900">{t('landing.feature.calendar')}</div>
          <div className="mt-0.5 text-[12px] text-gray-500">15:00 – 16:30 · Room 105</div>
        </div>

        <div className="pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {t('landing.insideStudents')}
        </div>

        <div className="flex flex-col gap-2.5">
          {ROWS.map((row, i) => {
            const done = showAll || i < marked;
            return (
              <div key={row.initials} className="flex h-[52px] items-center justify-between rounded-xl bg-gray-50 px-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${row.tone}`}>
                    {row.initials}
                  </span>
                  <span className="truncate text-[13px] font-medium text-gray-900">{row.name}</span>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-300 ${
                    done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {done && <Check className="h-3 w-3" strokeWidth={3} />}
                  {done ? t('status.completed') : t('stuSess.upcoming')}
                </span>
              </div>
            );
          })}
        </div>

        {!showAll && (
          <div
            aria-hidden
            className="pointer-events-none absolute right-6 drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-all duration-500 ease-out"
            style={{ top: `${ROW_CURSOR_TOP[activeRow]}%` }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
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
