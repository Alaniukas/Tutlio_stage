import { format, parseISO } from 'date-fns';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Shared layout — prevents horizontal overflow / off-center modal shift. */
export const ASSIGN_STUDENT_FREE_SLOT_DIALOG_CONTENT_CLASS = cn(
  '!w-[min(520px,calc(100vw-2rem))] !max-w-[min(520px,calc(100vw-2rem))]',
  'max-h-[min(90dvh,860px)] overflow-x-hidden overflow-y-auto box-border gap-3 p-4 sm:p-5',
  '[&_input]:max-w-full [&_input]:min-w-0',
);

export type AssignStudentFreeSlotStudent = { id: string; full_name: string };

export type AssignStudentFreeSlotDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tutorName: string;
  subjectName: string;
  startIso: string;
  endIso: string;
  slots: Array<{ label: string; startIso: string }>;
  selectedSlot: string;
  onSelectedSlotChange: (value: string) => void;
  students: AssignStudentFreeSlotStudent[];
  studentId: string;
  onStudentIdChange: (value: string) => void;
  studentIds: string[];
  onStudentIdsChange: (ids: string[]) => void;
  isGroup: boolean;
  topic: string;
  onTopicChange: (value: string) => void;
  meetingLink: string;
  onMeetingLinkChange: (value: string) => void;
  isPaid: boolean;
  onIsPaidChange: (value: boolean) => void;
  showSuccess?: boolean;
  showCrossTutorHint?: boolean;
  showTrialButton?: boolean;
  saving?: boolean;
  trialSending?: boolean;
  createdCount?: number;
  onCancel: () => void;
  onCreate: () => void;
  onReserveTrial?: () => void;
};

function sortStudents(students: AssignStudentFreeSlotStudent[]) {
  return [...students].sort((a, b) =>
    (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' }),
  );
}

export default function AssignStudentFreeSlotDialog({
  open,
  onOpenChange,
  tutorName,
  subjectName,
  startIso,
  endIso,
  slots,
  selectedSlot,
  onSelectedSlotChange,
  students,
  studentId,
  onStudentIdChange,
  studentIds,
  onStudentIdsChange,
  isGroup,
  topic,
  onTopicChange,
  meetingLink,
  onMeetingLinkChange,
  isPaid,
  onIsPaidChange,
  showSuccess = false,
  showCrossTutorHint = false,
  showTrialButton = false,
  saving = false,
  trialSending = false,
  createdCount = 0,
  onCancel,
  onCreate,
  onReserveTrial,
}: AssignStudentFreeSlotDialogProps) {
  const { t } = useTranslation();
  const sortedStudents = sortStudents(students);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={ASSIGN_STUDENT_FREE_SLOT_DIALOG_CONTENT_CLASS}>
        <DialogHeader className="min-w-0 w-full space-y-2 text-left">
          <DialogTitle className="pr-8 leading-snug">{t('findLesson.bookDialogTitle')}</DialogTitle>
          <DialogDescription asChild>
            <div className="min-w-0 w-full space-y-2 text-sm text-muted-foreground text-left">
              <p className="break-words">
                <span className="font-semibold text-gray-900">{tutorName}</span>
                {' · '}
                <span>{subjectName}</span>
              </p>
              <p className="text-sm text-gray-600 tabular-nums break-words">
                {t('findLesson.freeWindowSummary')}: {format(parseISO(startIso), 'yyyy-MM-dd HH:mm')} –{' '}
                {format(parseISO(endIso), 'HH:mm')}
              </p>
              <p className="text-xs text-gray-500 break-words">{t('findLesson.bookDialogIntro')}</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 w-full space-y-3">
          {showSuccess && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('findLesson.lessonCreatedKeepOpen')}</span>
            </div>
          )}
          {showCrossTutorHint && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 break-words">
              {t('findLesson.crossTutorHint')}
            </div>
          )}
          {slots.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 break-words">
              {createdCount > 0 ? t('findLesson.windowFullyBooked') : t('findLesson.noSubSlots')}
            </div>
          ) : (
            <div className="min-w-0 w-full space-y-1.5">
              <Label className="text-xs">{t('compSch.time')}</Label>
              <Select value={selectedSlot || undefined} onValueChange={onSelectedSlotChange}>
                <SelectTrigger className="h-9 w-full min-w-0 max-w-full rounded-xl text-sm">
                  <SelectValue placeholder={t('compSch.selectTimePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((slot) => (
                    <SelectItem key={slot.startIso} value={slot.startIso}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isGroup ? (
            <div className="min-w-0 w-full space-y-1.5">
              <Label className="text-xs">{t('compSch.studentsGroup')}</Label>
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
                {sortedStudents.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={studentIds.includes(s.id)}
                      onChange={(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        if (checked) {
                          onStudentIdsChange(Array.from(new Set([...studentIds, s.id])));
                        } else {
                          onStudentIdsChange(studentIds.filter((id) => id !== s.id));
                        }
                      }}
                    />
                    <span className="min-w-0 break-words">{s.full_name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="min-w-0 w-full space-y-1.5">
              <Label className="text-xs">{t('compSch.studentRequired')}</Label>
              <Select value={studentId} onValueChange={onStudentIdChange}>
                <SelectTrigger className="h-9 w-full min-w-0 max-w-full rounded-xl text-sm">
                  <SelectValue placeholder={t('compSch.selectStudentPlaceholderDots')} />
                </SelectTrigger>
                <SelectContent>
                  {sortedStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="min-w-0 w-full space-y-1.5">
            <Label className="text-xs">{t('compSch.topicOptional')}</Label>
            <Input
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
              placeholder={t('compSch.lessonTopicPlaceholder')}
              className="h-9 w-full min-w-0 max-w-full rounded-xl text-sm"
            />
          </div>

          <div className="min-w-0 w-full space-y-1.5">
            <Label className="text-xs">{t('compSch.meetingLink')}</Label>
            <Input
              value={meetingLink}
              onChange={(e) => onMeetingLinkChange(e.target.value)}
              placeholder="https://..."
              className="h-9 w-full min-w-0 max-w-full rounded-xl text-sm"
            />
            <p className="text-[11px] leading-relaxed text-gray-500 break-words">{t('findLesson.meetingLinkHint')}</p>
          </div>

          <div className="flex min-h-[4.5rem] min-w-0 w-full flex-col justify-center rounded-xl border border-green-100 bg-green-50/50 p-3 sm:p-4">
            <button
              type="button"
              onClick={() => onIsPaidChange(!isPaid)}
              className="flex w-full min-w-0 items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-green-900">{t('compSch.alreadyPaid')}</p>
                <p className="text-xs text-green-800/80">{t('compSch.ifStudentPaid')}</p>
              </div>
              <div
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
                  isPaid ? 'bg-green-500' : 'bg-gray-300',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                    isPaid ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </div>
            </button>
          </div>
        </div>

        <DialogFooter className="!flex !flex-col w-full min-w-0 gap-2 sm:!flex-col sm:space-x-0">
          <Button variant="outline" className="h-auto min-h-10 w-full rounded-xl py-2" onClick={onCancel}>
            {t('compSch.cancel')}
          </Button>
          {showTrialButton && (
            <Button
              variant="outline"
              className="h-auto min-h-10 w-full whitespace-normal rounded-xl border-amber-300 py-2 text-center text-amber-700 hover:bg-amber-50"
              onClick={() => onReserveTrial?.()}
              disabled={trialSending || saving || slots.length === 0 || !studentId}
            >
              {trialSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('compSch.creating')}
                </>
              ) : (
                t('findLesson.reserveTrial')
              )}
            </Button>
          )}
          <Button
            className="h-auto min-h-10 w-full rounded-xl bg-indigo-600 py-2 hover:bg-indigo-700"
            onClick={onCreate}
            disabled={saving || trialSending || slots.length === 0}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('compSch.creating')}
              </>
            ) : createdCount > 0 ? (
              t('findLesson.createAnotherLesson')
            ) : (
              t('compSch.createLesson')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
