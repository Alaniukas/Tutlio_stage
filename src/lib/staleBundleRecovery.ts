import { hasPendingLocaleLoads } from '@/lib/i18n/core';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

// Match the locale + eight-character content hash emitted by our Vite build.
// Nested vendor language assets (e.g. fr-FR-...-....js) are not dictionaries.
const localeChunk = new RegExp(`/assets/(?:${SUPPORTED_LOCALES.join('|')})-[\\w-]{8}\\.js(?:[?#\\s'\")]|$)`);

function isPendingLocaleError(payload: unknown): boolean {
  const message = payload instanceof Error ? payload.message : typeof payload === 'string' ? payload : '';
  return hasPendingLocaleLoads() && localeChunk.test(message);
}

/** LocaleProvider owns recoverable dictionary failures, retaining unsaved input.
 * Leave those errors unprevented so Vite rejects the import and the retry UI can
 * catch it. Other lazy route/script failures retain the existing shell recovery. */
export function installStaleBundleRecovery(recover: () => Promise<void>): () => void {
  const onError = (event: ErrorEvent) => {
    const target = event.target;
    if (target instanceof HTMLScriptElement && target.src.includes('/assets/')) void recover();
  };
  const onPreloadError = (event: Event) => {
    if (isPendingLocaleError((event as Event & { payload?: unknown }).payload)) return;
    event.preventDefault();
    void recover();
  };
  window.addEventListener('error', onError, true);
  window.addEventListener('vite:preloadError', onPreloadError);
  return () => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('vite:preloadError', onPreloadError);
  };
}
