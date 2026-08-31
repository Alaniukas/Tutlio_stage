import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { detectPlatformFromPathname, getPlatformBasename } from '@/lib/platform';
import { canonicalHostRedirectUrl } from '@/lib/market';
import { installStaleBundleRecovery } from '@/lib/staleBundleRecovery';
import App from './App.tsx';
import './index.css';

let swRecoveryAttempted = false;

async function clearServiceWorkerAndReload(): Promise<void> {
  if (swRecoveryAttempted) return;
  swRecoveryAttempted = true;
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // Best-effort — still reload so the browser can fetch fresh index.html.
  }
  window.location.reload();
}

// A PWA service worker cached on an apex host (tutlio.pl/.lt/.com) can boot the SPA
// on the apex origin, whose relative /api calls then 308 cross-origin to www and fail
// CORS preflight (admin login breaks). Bounce to the canonical www host before booting.
const canonicalUrl = canonicalHostRedirectUrl(window.location.href);
if (canonicalUrl && canonicalUrl !== window.location.href) {
  window.location.replace(canonicalUrl);
} else {
  installStaleBundleRecovery(clearServiceWorkerAndReload);
  bootApp();
}

function bootApp() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => void registration.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
    },
  });

  const platform = detectPlatformFromPathname(window.location.pathname);
  const basename = getPlatformBasename(platform);

  const renderApp = () => {
    try {
      sessionStorage.removeItem('tutlio_sw_shell_recovery');
    } catch {
      /* ignore */
    }
    createRoot(document.getElementById('root')!).render(
      <PlatformProvider platform={platform}>
        <LocaleProvider>
          <App basename={basename} />
        </LocaleProvider>
      </PlatformProvider>,
    );
  };

  // Mount the recovery UI immediately. LocaleProvider waits for the dictionary
  // before mounting App, so the empty-root watchdog cannot mistake a slow
  // language download for a stale shell and reload it after six seconds.
  renderApp();
}
