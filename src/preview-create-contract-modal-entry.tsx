import { createRoot } from 'react-dom/client';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { StaticLocaleProvider } from '@/contexts/LocaleContext';
import PreviewCreateContractModal from '@/pages/dev/PreviewCreateContractModal';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <PlatformProvider platform="tutors">
    <StaticLocaleProvider locale="lt">
      <PreviewCreateContractModal />
    </StaticLocaleProvider>
  </PlatformProvider>,
);
