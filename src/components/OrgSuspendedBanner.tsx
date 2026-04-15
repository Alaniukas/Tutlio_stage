import { AlertTriangle } from 'lucide-react';
import { useOrgAccess } from '@/hooks/useOrgAccess';
import { useTranslation } from '@/lib/i18n';

export default function OrgSuspendedBanner() {
  const { loading, suspended } = useOrgAccess();
  const { t } = useTranslation();

  if (loading || !suspended) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-400/40 text-amber-950 px-4 py-2.5 text-sm text-center font-medium">
      <span className="inline-flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4" aria-hidden />
        {t('org.suspended')}
      </span>
    </div>
  );
}
