import StudentLayout from '@/components/StudentLayout';
import ConsultationsPortal from '@/components/consultations/ConsultationsPortal';
import { useTranslation } from '@/lib/i18n';

export default function StudentConsultations() {
  const { t } = useTranslation();
  return (
    <StudentLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold">{t('schoolConsult.title')}</h1>
        <ConsultationsPortal />
      </div>
    </StudentLayout>
  );
}
