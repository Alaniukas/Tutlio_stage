import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Motion primitives shared by the landing product mocks (hero tablet,
 * walkthrough frame, phone screen). Everything keys off an `on` flag so a
 * panel replays its entrance each time the demo loop returns to it, and
 * `instant` collapses the motion for prefers-reduced-motion. Keyframe
 * classes (`landing-pop`, `landing-toast-in`, `landing-tap`,
 * `landing-typing-dot`, `landing-caret`) live in src/index.css.
 */

export function usePrefersReducedMotion(): boolean {
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
 * "€2 140" style: euro sign and a no-break space as thousands separator, so
 * the whole amount stays one number run and is not reordered on RTL pages.
 */
export function formatEuro(n: number): string {
  return `€${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')}`;
}

/**
 * Animates from the previously shown value to `target`. Resets to 0 while
 * `on` is false so the next entrance counts up again; a target change while
 * `on` (e.g. a payment landing) eases from the current value instead.
 */
export function useCountUp(
  on: boolean,
  target: number,
  options: { duration?: number; delay?: number; instant?: boolean } = {},
): number {
  const { duration = 900, delay = 0, instant = false } = options;
  const [value, setValue] = useState(instant ? target : 0);
  const latest = useRef(instant ? target : 0);

  useEffect(() => {
    if (instant) {
      latest.current = target;
      setValue(target);
      return;
    }
    if (!on) {
      latest.current = 0;
      setValue(0);
      return;
    }
    const from = latest.current;
    if (from === target) return;
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, Math.max(0, (now - start - delay) / duration));
      const eased = 1 - (1 - p) ** 3;
      const next = Math.round(from + (target - from) * eased);
      latest.current = next;
      setValue(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [on, target, duration, delay, instant]);

  return value;
}

export function CountUp({
  on,
  to,
  format = String,
  className,
  delay,
  instant,
}: {
  on: boolean;
  to: number;
  format?: (n: number) => string;
  className?: string;
  delay?: number;
  instant?: boolean;
}) {
  const value = useCountUp(on, to, { delay, instant });
  return (
    <span dir="ltr" className={className}>
      {format(value)}
    </span>
  );
}

/** Fades and lifts a row into place; `index` staggers siblings. */
export function Rise({
  on,
  index = 0,
  step = 70,
  base = 100,
  instant = false,
  className = '',
  style,
  children,
}: {
  on: boolean;
  index?: number;
  step?: number;
  base?: number;
  instant?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={`transition-all duration-500 ease-out ${
        on ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } ${className}`}
      style={{
        ...style,
        transitionDelay: on && !instant ? `${base + index * step}ms` : '0ms',
        transitionDuration: instant ? '0ms' : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** A bar that grows to `size` (width by default, height with axis "y") when `on`. */
export function Grow({
  on,
  size,
  axis = 'x',
  delay = 0,
  instant = false,
  className = '',
  style,
}: {
  on: boolean;
  size: string;
  axis?: 'x' | 'y';
  delay?: number;
  instant?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const dimension = axis === 'x' ? 'width' : 'height';
  return (
    <div
      className={`${axis === 'x' ? 'transition-[width]' : 'transition-[height]'} duration-700 ease-out ${className}`}
      style={{
        ...style,
        [dimension]: on || instant ? size : '0%',
        transitionDelay: on && !instant ? `${delay}ms` : '0ms',
        transitionDuration: instant ? '0ms' : undefined,
      }}
    />
  );
}

/** Three bouncing dots, the universal "someone is typing" signal. */
export function TypingDots({ className = '', dotClassName = 'bg-zinc-400' }: { className?: string; dotClassName?: string }) {
  return (
    <span aria-hidden className={`inline-flex items-center gap-[3px] ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`landing-typing-dot h-1.5 w-1.5 rounded-full ${dotClassName}`}
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}
