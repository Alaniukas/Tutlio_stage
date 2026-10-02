import { CheckCircle, Clock, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { schoolAttendanceLabel } from '@/lib/i18n/schoolAttendanceCopy';
import { cn } from '@/lib/utils';
import type { SchoolGroupAttendanceParticipant } from '@/lib/schoolGroupAttendance';
import {
  schoolAttendanceAutoHint,
  schoolLessonHasEnded,
  schoolSessionAttendanceSelection,
  type SchoolAttendanceSelection,
} from '@/lib/schoolAttendanceUi';

type AttendanceSession = {
  status?: string | null;
  start_time: Date | string;
  end_time: Date | string;
  meeting_link?: string | null;
  student_joined_at?: string | null;
  tutor_joined_at?: string | null;
  status_confirmed_at?: string | null;
  completed_late?: boolean | null;
};

export function SchoolGroupRosterAttendanceControls({
  session,
  participant,
  requireConfirmation = true,
  disabled,
  onConfirmSession,
  onConfirmAttestation,
}: {
  session?: AttendanceSession | null;
  participant?: SchoolGroupAttendanceParticipant;
  requireConfirmation?: boolean;
  disabled: boolean;
  onConfirmSession?: (status: 'completed' | 'no_show', late?: boolean) => void;
  onConfirmAttestation?: (studentId: string, status: 'completed' | 'no_show') => void;
}) {
  const { locale } = useTranslation();

  if (session && schoolLessonHasEnded(session.end_time)) {
    const selection = schoolSessionAttendanceSelection(session, requireConfirmation);
    const autoHint = schoolAttendanceAutoHint(session, locale);
    const press = (next: SchoolAttendanceSelection) => {
      if (!onConfirmSession) return;
      if (next === 'late') onConfirmSession('completed', true);
      else onConfirmSession(next, false);
    };
    return (
      <div className="flex w-full min-w-[12rem] flex-col items-end gap-1.5">
        {autoHint ? <p className="text-xs text-gray-500 text-right">{autoHint}</p> : null}
        <div className="flex flex-wrap justify-end gap-1">
          <AttendanceButton
            pressed={selection === 'completed'}
            disabled={disabled}
            label={schoolAttendanceLabel(locale, 'confirmParticipation')}
            icon={CheckCircle}
            tone="emerald"
            onClick={() => press('completed')}
          />
          <AttendanceButton
            pressed={selection === 'late'}
            disabled={disabled}
            label={schoolAttendanceLabel(locale, 'late')}
            icon={Clock}
            tone="amber"
            onClick={() => press('late')}
          />
          <AttendanceButton
            pressed={selection === 'no_show'}
            disabled={disabled}
            label={schoolAttendanceLabel(locale, 'absent')}
            icon={UserX}
            tone="rose"
            onClick={() => press('no_show')}
          />
        </div>
      </div>
    );
  }

  if (!participant?.canConfirmAttendance || participant.realSessionId) return null;
  const selection = participant.attendance?.status === 'completed'
    ? 'completed'
    : participant.attendance?.status === 'no_show'
      ? 'no_show'
      : null;
  return (
    <div className="flex w-full min-w-[12rem] flex-col items-end gap-1.5">
      <p className="text-xs text-gray-500 text-right">{schoolAttendanceLabel(locale, 'autoMissing')}</p>
      <div className="flex flex-wrap justify-end gap-1">
        <AttendanceButton
          pressed={selection === 'completed'}
          disabled={disabled}
          label={schoolAttendanceLabel(locale, 'confirmParticipation')}
          icon={CheckCircle}
          tone="emerald"
          onClick={() => onConfirmAttestation?.(participant.studentId, 'completed')}
        />
        <AttendanceButton
          pressed={selection === 'no_show'}
          disabled={disabled}
          label={schoolAttendanceLabel(locale, 'absent')}
          icon={UserX}
          tone="rose"
          onClick={() => onConfirmAttestation?.(participant.studentId, 'no_show')}
        />
      </div>
    </div>
  );
}

function AttendanceButton({
  pressed,
  disabled,
  label,
  icon: Icon,
  tone,
  onClick,
}: {
  pressed: boolean;
  disabled: boolean;
  label: string;
  icon: typeof CheckCircle;
  tone: 'emerald' | 'amber' | 'rose';
  onClick: () => void;
}) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
    : tone === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-rose-300 bg-rose-50 text-rose-800';
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={pressed}
      className={cn('h-8 px-2 text-xs', pressed ? toneClass : 'border-gray-200 text-gray-700')}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="mr-1 h-3.5 w-3.5" />{label}
    </Button>
  );
}
