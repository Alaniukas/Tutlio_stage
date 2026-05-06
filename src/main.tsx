import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { detectPlatformFromPathname, getPlatformBasename } from '@/lib/platform';
import App from './App.tsx';
import './index.css';

registerSW({ immediate: true });

const platform = detectPlatformFromPathname(window.location.pathname);
const basename = getPlatformBasename(platform);
// #region agent log
fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run1',hypothesisId:'H0',location:'main.tsx:bootstrap',message:'main bootstrap reached',data:{pathname:window.location.pathname},timestamp:Date.now()})}).catch(()=>{});
// #endregion

createRoot(document.getElementById('root')!).render(
  <PlatformProvider platform={platform}>
    <LocaleProvider>
      <App basename={basename} />
    </LocaleProvider>
  </PlatformProvider>,
);
