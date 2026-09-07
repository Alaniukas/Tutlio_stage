import { useTranslation } from '@/lib/i18n';
import type { ParentChildOption } from '@/lib/parentActiveChild';

export default function ParentChildSwitcher({
  options,
  value,
  onChange,
  className = '',
}: {
  options: ParentChildOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (options.length < 2) return null;
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {t('parent.viewingChild')}
      </p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.fullName || c.id}
          </option>
        ))}
      </select>
    </div>
  );
}
