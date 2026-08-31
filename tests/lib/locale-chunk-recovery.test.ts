import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStaleBundleRecovery } from '@/lib/staleBundleRecovery';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

const state = vi.hoisted(() => ({ pending: true }));
vi.mock('@/lib/i18n/core', async (importOriginal) => ({
  ...await importOriginal<object>(), hasPendingLocaleLoads: () => state.pending,
}));
afterEach(() => { state.pending = true; });
function preloadFailure(message: string) {
  const event = new Event('vite:preloadError', { cancelable: true });
  Object.defineProperty(event, 'payload', { value: new TypeError(message) });
  window.dispatchEvent(event);
  return event;
}

describe('dictionary and route chunk failures', () => {
  it.each(SUPPORTED_LOCALES)('lets a pending %s import reject into the retry UI without refreshing away form data', (locale) => {
    const recover = vi.fn(async () => {});
    const remove = installStaleBundleRecovery(recover);
    try {
      const event = preloadFailure(`Failed to fetch dynamically imported module: https://www.tutlio.com/assets/${locale}-abc_D-12.js`);
      expect(event.defaultPrevented).toBe(false);
      expect(recover).not.toHaveBeenCalled();
    } finally { remove(); }
  });
  it.each([
    'Failed to fetch dynamically imported module: https://www.tutlio.com/assets/Calendar-abc.js',
    'Unable to preload CSS for /assets/QuizFunnel-abc.css',
    'Failed to fetch dynamically imported module: https://www.tutlio.com/assets/shared-abc.js',
    'Failed to fetch dynamically imported module: https://www.tutlio.com/assets/fr-FR-RHASNOE6-CA015Hvc.js',
  ])('retains existing stale-shell recovery for %s', (message) => {
    const recover = vi.fn(async () => {});
    const remove = installStaleBundleRecovery(recover);
    try {
      expect(preloadFailure(message).defaultPrevented).toBe(true);
      expect(recover).toHaveBeenCalledTimes(1);
    } finally { remove(); }
  });
  it('does not swallow locale-looking errors outside an active dictionary request', () => {
    state.pending = false;
    const recover = vi.fn(async () => {});
    const remove = installStaleBundleRecovery(recover);
    try {
      expect(preloadFailure('Failed to fetch dynamically imported module: /assets/he-123.js').defaultPrevented).toBe(true);
      expect(recover).toHaveBeenCalledTimes(1);
    } finally { remove(); }
  });
  it('keeps script error recovery and removes listeners on cleanup', () => {
    const recover = vi.fn(async () => {});
    const remove = installStaleBundleRecovery(recover);
    const script = document.createElement('script'); script.src = '/assets/index-test.js';
    document.body.appendChild(script);
    try {
      script.dispatchEvent(new Event('error'));
      expect(recover).toHaveBeenCalledTimes(1);
      remove();
      script.dispatchEvent(new Event('error'));
      preloadFailure('A route failure');
      expect(recover).toHaveBeenCalledTimes(1);
    } finally { remove(); script.remove(); }
  });
});
