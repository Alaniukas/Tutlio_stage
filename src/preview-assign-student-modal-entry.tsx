import { createRoot } from 'react-dom/client';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { StaticLocaleProvider } from '@/contexts/LocaleContext';
import PreviewAssignStudentModal from '@/pages/dev/PreviewAssignStudentModal';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <PlatformProvider platform="tutors">
    <StaticLocaleProvider locale="lt">
      <PreviewAssignStudentModal />
    </StaticLocaleProvider>
  </PlatformProvider>,
);
