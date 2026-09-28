import ParentLayout from '@/components/ParentLayout';
import ConsultationsPortal from '@/components/consultations/ConsultationsPortal';
import { useTranslation } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';

export default function ParentConsultations() {
  const { t } = useTranslation();
  const [search] = useSearchParams();
  return (
    <ParentLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold">{t('schoolConsult.title')}</h1>
        <ConsultationsPortal organizationId={search.get('organization_id')} selectedStudentId={search.get('student_id')} />
      </div>
    </ParentLayout>
  );
}
