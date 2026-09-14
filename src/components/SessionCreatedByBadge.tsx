import { useTranslation } from '@/lib/i18n';
import { sessionCreatedByRoleLabelKey } from '@/lib/sessionCreatedByRole';
import { cn } from '@/lib/utils';

type Props = {
  createdByRole?: string | null;
  className?: string;
};

/** Highlights student/parent self-booking and other non-tutor creators in org views. */
export default function SessionCreatedByBadge({ createdByRole, className }: Props) {
  const { t } = useTranslation();
  const labelKey = sessionCreatedByRoleLabelKey(createdByRole);
  if (!labelKey) return null;

  const isSelfBooked = createdByRole === 'student' || createdByRole === 'parent';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight',
        isSelfBooked
          ? 'border-violet-200 bg-violet-50 text-violet-800'
          : 'border-gray-200 bg-gray-50 text-gray-600',
        className,
      )}
    >
      {t(labelKey)}
    </span>
  );
}
