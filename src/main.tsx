import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { detectPlatformFromPathname, getPlatformBasename } from '@/lib/platform';
import { detectLocale, loadLocaleDict, isLocaleLoaded } from '@/lib/i18n';
import App from './App.tsx';
import './index.css';

registerSW({ immediate: true });

const platform = detectPlatformFromPathname(window.location.pathname);
const basename = getPlatformBasename(platform);

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <PlatformProvider platform={platform}>
      <LocaleProvider>
        <App basename={basename} />
      </LocaleProvider>
    </PlatformProvider>,
  );
}

// Non-default locales load their dictionary as a separate chunk. Wait for it
// before the first paint so deep links like /fr/pricing never flash English;
// for lt/en/pl (the bundled domain defaults) this renders synchronously.
const initialLocale = detectLocale();
if (isLocaleLoaded(initialLocale)) {
  renderApp();
} else {
  loadLocaleDict(initialLocale).catch(() => {}).finally(renderApp);
}
