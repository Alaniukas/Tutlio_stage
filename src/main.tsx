import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { detectPlatformFromPathname, getPlatformBasename } from '@/lib/platform';
import App from './App.tsx';
import './index.css';

const platform = detectPlatformFromPathname(window.location.pathname);
const basename = getPlatformBasename(platform);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider platform={platform}>
      <LocaleProvider>
        <App basename={basename} />
      </LocaleProvider>
    </PlatformProvider>
  </StrictMode>,
);
