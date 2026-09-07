import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { deriveAttendance, type AttendanceSessionLike } from '@/lib/attendance';
import { UserCheck, AlertTriangle } from 'lucide-react';

/**
 * Compact lesson attendance badge derived from join-link clicks.
 * Renders nothing while attendance is not assessable yet (lesson not started /
 * within the 10 min grace window / cancelled) or for lessons without a meeting link.
 */
export default function AttendanceBadge({
  session,
  className,
}: {
  session: AttendanceSessionLike & { meeting_link?: string | null };
  className?: string;
}) {
  const { t } = useTranslation();
  if (!session?.meeting_link) return null;

  const info = deriveAttendance(session);
  if (!info.applicable) return null;

  const time = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }) : '';

  if (!info.flagged) {
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap', className)}>
        <UserCheck className="w-3 h-3" />
        {t('att.bothJoined')}
      </span>
    );
  }

  const issues: string[] = [];
  if (info.tutor === 'missing') issues.push(t('att.tutorMissing'));
  else if (info.tutor === 'late') issues.push(t('att.tutorLate', { time: time(session.tutor_joined_at) }));
  if (info.student === 'missing') issues.push(t('att.studentMissing'));
  else if (info.student === 'late') issues.push(t('att.studentLate', { time: time(session.student_joined_at) }));

  const allMissing = info.tutor === 'missing' && info.student === 'missing';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap',
        allMissing
          ? 'bg-red-50 text-red-700 border-red-100'
          : 'bg-amber-50 text-amber-700 border-amber-100',
        className,
      )}
    >
      <AlertTriangle className="w-3 h-3" />
      {allMissing ? t('att.bothMissing') : issues.join(' · ')}
    </span>
  );
}
