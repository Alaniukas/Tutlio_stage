import { Info } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { isMoksloVaisiaiOrg, MOKSLO_VAISIAI_ADMIN_EMAIL } from '@/lib/marketMoney';

export function LessonRescheduleHelp({ organizationId }: { organizationId?: string | null }) {
  const { t } = useTranslation();
  if (!isMoksloVaisiaiOrg(organizationId)) return null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        {t('stuSess.rescheduleHelp')}{' '}
        <a href={`mailto:${MOKSLO_VAISIAI_ADMIN_EMAIL}`} className="font-medium underline underline-offset-2 break-all">
          {MOKSLO_VAISIAI_ADMIN_EMAIL}
        </a>
      </p>
    </div>
  );
}
