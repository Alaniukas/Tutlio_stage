import { supabase } from '@/lib/supabase';

const LANDING_STATS_TIMEOUT_MS = 3000;

/** Public homepage counter. Must never hang the landing page if Postgres is slow. */
export function loadPublicLandingLessonCount(onCount: (n: number) => void): () => void {
  let cancelled = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LANDING_STATS_TIMEOUT_MS);
  void supabase
    .rpc('get_public_landing_stats')
    .abortSignal(controller.signal)
    .then(({ data }) => {
      if (cancelled || !data) return;
      const d = data as { completed_lessons?: number; upcoming_lessons?: number };
      onCount(Number(d.completed_lessons || 0) + Number(d.upcoming_lessons || 0));
    })
    .catch(() => {
      /* Landing copy still renders without the live count */
    })
    .finally(() => clearTimeout(timer));

  return () => {
    cancelled = true;
    controller.abort();
    clearTimeout(timer);
  };
}
