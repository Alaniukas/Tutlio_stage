import ParentLayout from '@/components/ParentLayout';
import PwaInstallGuide from '@/components/PwaInstallGuide';
import { useTranslation } from '@/lib/i18n';

export default function ParentInstructions() {
  const { t } = useTranslation();

  return (
    <ParentLayout>
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4 pb-8">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('parent.instructionsTitle')}</h1>
          <p className="text-sm text-gray-600">{t('parent.instructionsPwaLead')}</p>
        </div>
        <PwaInstallGuide variant="instructions" />
      </div>
    </ParentLayout>
  );
}
