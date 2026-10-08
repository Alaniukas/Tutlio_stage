import { Building2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from '@/lib/i18n';
import type { TutorEnvironment } from '@/lib/tutorEnvironments';

export default function TutorEnvironmentSwitcher({ environments, value, busy, compact, onChange, onManage }: {
  environments: TutorEnvironment[];
  value: string;
  busy: boolean;
  compact?: boolean;
  onChange: (id: string) => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  if (environments.length < 2) return null;
  if (compact) return (
    <button type="button" onClick={onManage} disabled={busy} title={t('tutorEnv.choose')}
      aria-label={t('tutorEnv.choose')}
      className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50">
      <Building2 className="h-5 w-5" />
    </button>
  );
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/60 p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-gray-500">{t('tutorEnv.viewingCompany')}</label>
        <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
      </div>
        <select id={id} value={value} disabled={busy} onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-900 disabled:opacity-50">
          {environments.map((environment) => (
            <option key={environment.tutorId} value={environment.tutorId}>
              {environment.organizationName}{environments.filter((row) => row.organizationId === environment.organizationId).length > 1 ? ` (${environment.email})` : ''}
            </option>
          ))}
        </select>
    </div>
  );
}
