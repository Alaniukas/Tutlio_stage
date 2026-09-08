/** Bounded reconciliation: no background requests and never overlap slow calls. */
export function startVisiblePolling(run: () => Promise<void>, intervalMs: number, maxAttempts: number): () => void {
  let attempts = 0;
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (stopped || running || document.visibilityState === 'hidden') return;
    running = true;
    attempts++;
    try { await run(); }
    finally {
      running = false;
      if (attempts >= maxAttempts) stop();
    }
  };
  const interval = setInterval(() => { void tick().catch(() => {}); }, intervalMs);
  const resume = () => { if (document.visibilityState === 'visible') void tick().catch(() => {}); };
  function stop() {
    stopped = true;
    clearInterval(interval);
    document.removeEventListener('visibilitychange', resume);
  }
  document.addEventListener('visibilitychange', resume);
  return stop;
}
