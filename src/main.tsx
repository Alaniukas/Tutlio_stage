import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { detectPlatformFromPathname, getPlatformBasename } from '@/lib/platform';
import { detectLocale, loadLocaleDict, isLocaleLoaded } from '@/lib/i18n';
import { canonicalHostRedirectUrl } from '@/lib/market';
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

function installStaleBundleRecovery(): void {
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement && target.src.includes('/assets/')) {
        void clearServiceWorkerAndReload();
      }
    },
    true,
  );
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    void clearServiceWorkerAndReload();
  });
}

// A PWA service worker cached on an apex host (tutlio.pl/.lt/.com) can boot the SPA
// on the apex origin, whose relative /api calls then 308 cross-origin to www and fail
// CORS preflight (admin login breaks). Bounce to the canonical www host before booting.
const canonicalUrl = canonicalHostRedirectUrl(window.location.href);
if (canonicalUrl && canonicalUrl !== window.location.href) {
  window.location.replace(canonicalUrl);
} else {
  installStaleBundleRecovery();
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

  // Every locale is a separate chunk. Wait for the requested dictionary before
  // first paint so deep links never flash another language and visitors never
  // download the two unrelated domain-default dictionaries.
  const initialLocale = detectLocale();
  if (isLocaleLoaded(initialLocale)) {
    renderApp();
  } else {
    loadLocaleDict(initialLocale).catch((err) => {
      console.error('[i18n] initial locale load failed', initialLocale, err);
    }).finally(renderApp);
  }
}
