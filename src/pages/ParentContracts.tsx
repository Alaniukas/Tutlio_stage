import { FileText } from 'lucide-react';
import ParentLayout from '@/components/ParentLayout';
import ParentExtraLessonsContracts from '@/components/parent/ParentExtraLessonsContracts';
import { useTranslation } from '@/lib/i18n';

export default function ParentContracts() {
  const { t } = useTranslation();

  return (
    <ParentLayout>
      <main className="w-full max-w-5xl mx-auto px-4 pt-6 flex-1 flex flex-col min-h-0 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-violet-600 shrink-0" />
          <h1 className="text-xl font-black text-gray-900 tracking-tight">{t('parent.contracts')}</h1>
        </div>
        <ParentExtraLessonsContracts showEmpty />
      </main>
    </ParentLayout>
  );
}
