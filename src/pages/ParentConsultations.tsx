import ParentLayout from '@/components/ParentLayout';
import ConsultationsPortal from '@/components/consultations/ConsultationsPortal';
import { useTranslation } from '@/lib/i18n';

export default function ParentConsultations() {
  const { t } = useTranslation();
  return (
    <ParentLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold">{t('schoolConsult.title')}</h1>
        <ConsultationsPortal />
      </div>
    </ParentLayout>
  );
}
