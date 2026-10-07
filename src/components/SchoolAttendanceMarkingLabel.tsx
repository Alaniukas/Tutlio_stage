import { useStaffLabels } from '@/hooks/useStaffLabels';
import { useTranslation } from '@/lib/i18n';
import {
  formatSchoolAttendanceMarkingDate,
  resolveSchoolAttendanceMarking,
  type SchoolAttendanceMarkingSession,
} from '@/lib/schoolAttendanceMarking';
import { cn } from '@/lib/utils';

type Props = {
  session: SchoolAttendanceMarkingSession;
  className?: string;
};

export function SchoolAttendanceMarkingLabel({ session, className }: Props) {
  const { t, locale } = useTranslation();
  const { staff } = useStaffLabels();
  const marking = resolveSchoolAttendanceMarking(session);
  if (!marking) return null;

  const date = formatSchoolAttendanceMarkingDate(marking.markedAt, locale);
  const label = marking.source === 'teacher'
    ? t('att.marking.teacher', { staff, date })
    : marking.source === 'admin'
      ? t('att.marking.admin', { date })
      : t('att.marking.system', { date });

  return (
    <p className={cn('text-xs text-gray-500', className)} title={label}>
      {label}
    </p>
  );
}
