import { useEffect, useState } from 'react';

export type VisualViewportSnapshot = {
  width: number;
  height: number;
  offsetTop: number;
};

function readVisualViewport(): VisualViewportSnapshot {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 900, offsetTop: 0 };
  }

  const viewport = window.visualViewport;
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
    offsetTop: Math.round(viewport?.offsetTop ?? 0),
  };
}

/**
 * `dvh` support still differs around mobile virtual keyboards. Keep overlays
 * inside the actually visible portion of the page on iOS and Android.
 */
export function useVisualViewport(): VisualViewportSnapshot {
  const [snapshot, setSnapshot] = useState(readVisualViewport);

  useEffect(() => {
    let animationFrame = 0;
    const update = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const next = readVisualViewport();
        setSnapshot((current) => (
          current.width === next.width
          && current.height === next.height
          && current.offsetTop === next.offsetTop
            ? current
            : next
        ));
      });
    };

    const viewport = window.visualViewport;
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    update();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, []);

  return snapshot;
}

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousOverscrollBehavior = body.style.overscrollBehavior;
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [locked]);
}
