import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TimeInput } from '@/components/ui/time-input';
import { useTranslation } from '@/lib/i18n';
import {
  combineLocalDateAndTime,
  lessonFitsAvailabilityWindow,
  toLocalHm,
  toLocalYmd,
} from '@/lib/pickedAvailabilityTime';
import { format, parseISO } from 'date-fns';

export interface PickedAvailabilityTimeEditorProps {
  tutorName?: string;
  subjectName?: string;
  windowStartIso: string;
  windowEndIso: string;
  startIso: string;
  endIso: string;
  onChange: (next: { startIso: string; endIso: string }) => void;
  onClear?: () => void;
}

export default function PickedAvailabilityTimeEditor({
  tutorName,
  subjectName,
  windowStartIso,
  windowEndIso,
  startIso,
  endIso,
  onChange,
  onClear,
}: PickedAvailabilityTimeEditorProps) {
  const { t } = useTranslation();
  const windowStart = parseISO(windowStartIso);
  const windowEnd = parseISO(windowEndIso);
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const invalidDates =
    Number.isNaN(windowStart.getTime()) ||
    Number.isNaN(windowEnd.getTime()) ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime());
  const fits =
    !invalidDates && lessonFitsAvailabilityWindow(windowStart, windowEnd, start, end);

  const applyStart = (hm: string) => {
    const nextStart = combineLocalDateAndTime(toLocalYmd(start), hm);
    if (!nextStart) return;
    const durationMs = Math.max(5 * 60 * 1000, end.getTime() - start.getTime());
    let nextEnd = new Date(nextStart.getTime() + durationMs);
    if (nextEnd.getTime() > windowEnd.getTime()) nextEnd = new Date(windowEnd.getTime());
    onChange({ startIso: nextStart.toISOString(), endIso: nextEnd.toISOString() });
  };

  const applyEnd = (hm: string) => {
    const nextEnd = combineLocalDateAndTime(toLocalYmd(start), hm);
    if (!nextEnd) return;
    onChange({ startIso: start.toISOString(), endIso: nextEnd.toISOString() });
  };

  return (
    <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {(tutorName || subjectName) && (
            <p className="text-sm font-medium text-gray-900">
              {[tutorName, subjectName].filter(Boolean).join(' · ')}
            </p>
          )}
          {!invalidDates && (
            <p className="text-xs text-gray-600 tabular-nums">
              {t('findLesson.freeWindowSummary')}: {format(windowStart, 'yyyy-MM-dd HH:mm')} –{' '}
              {format(windowEnd, 'HH:mm')}
            </p>
          )}
          <p className="text-xs text-gray-500">{t('findLesson.adjustExactTime')}</p>
        </div>
        {onClear && (
          <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={onClear}>
            {t('findLesson.clearPickedSlot')}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('common.date')}</Label>
          <p className="flex h-10 items-center rounded-md border border-input bg-white px-3 text-sm tabular-nums">
            {invalidDates ? '—' : toLocalYmd(start)}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('findLesson.startTime')}</Label>
          <TimeInput value={invalidDates ? '08:00' : toLocalHm(start)} onChange={applyStart} minuteStep={1} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('findLesson.endTime')}</Label>
          <TimeInput value={invalidDates ? '09:00' : toLocalHm(end)} onChange={applyEnd} minuteStep={1} />
        </div>
      </div>
      {!fits && (
        <p className="text-xs text-amber-800">{t('findLesson.outsideWindow')}</p>
      )}
    </div>
  );
}
