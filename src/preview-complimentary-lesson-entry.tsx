import { createRoot } from 'react-dom/client';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { StaticLocaleProvider } from '@/contexts/LocaleContext';
import PreviewComplimentaryLesson from '@/pages/dev/PreviewComplimentaryLesson';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <PlatformProvider platform="tutors">
    <StaticLocaleProvider locale="lt">
      <PreviewComplimentaryLesson />
    </StaticLocaleProvider>
  </PlatformProvider>,
);
