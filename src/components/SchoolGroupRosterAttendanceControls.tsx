import { CheckCircle, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { SchoolGroupAttendanceParticipant } from '@/lib/schoolGroupAttendance';

export function SchoolGroupRosterAttendanceControls({ participant, disabled, onConfirm }: {
  participant?: SchoolGroupAttendanceParticipant;
  disabled: boolean;
  onConfirm: (studentId: string, status: 'completed' | 'no_show') => void;
}) {
  const { t } = useTranslation();
  if (!participant?.canConfirmAttendance || participant.realSessionId) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button
        type="button" variant="outline" size="sm"
        aria-pressed={participant.attendance?.status === 'completed'}
        className={cn('h-8 px-2 text-xs', participant.attendance?.status === 'completed'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-700')}
        disabled={disabled}
        onClick={() => onConfirm(participant.studentId, 'completed')}
      >
        <CheckCircle className="mr-1 h-3.5 w-3.5" />{t('compSess.markAttended')}
      </Button>
      <Button
        type="button" variant="outline" size="sm"
        aria-pressed={participant.attendance?.status === 'no_show'}
        className={cn('h-8 px-2 text-xs', participant.attendance?.status === 'no_show'
          ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-gray-200 text-gray-700')}
        disabled={disabled}
        onClick={() => onConfirm(participant.studentId, 'no_show')}
      >
        <UserX className="mr-1 h-3.5 w-3.5" />{t('compSess.markNoShow')}
      </Button>
    </div>
  );
}
