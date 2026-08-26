import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TimeInput } from '@/components/ui/time-input';
import { CalendarClock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import type { StudentPreferredWindow } from '@/lib/studentAvailability';

interface StudentAvailabilityEditorProps {
  /** Saved windows for the selected student (identity group). */
  value: StudentPreferredWindow[];
  saving: boolean;
  onSave: (next: StudentPreferredWindow[]) => Promise<void>;
}

/**
 * Student card availability block (req: "kada mokiniui tinka pamokos") —
 * weekday pills + one hour range per checked day. Saved windows prefill the
 * free-time tutor search for this student.
 */
export default function StudentAvailabilityEditor({ value, saving, onSave }: StudentAvailabilityEditorProps) {
  const { t } = useTranslation();
  const [windows, setWindows] = useState<StudentPreferredWindow[]>(value);
  const [dirty, setDirty] = useState(false);

  // Parents typically pass a freshly-derived array each render; only reset the
  // draft when the saved VALUE actually changed (e.g. another student opened).
  const valueKey = JSON.stringify(value);
  useEffect(() => {
    setWindows(JSON.parse(valueKey) as StudentPreferredWindow[]);
    setDirty(false);
  }, [valueKey]);

  const weekdays = useMemo(() => [
    { dayOfWeek: 1, label: t('compSch.wdMon') },
    { dayOfWeek: 2, label: t('compSch.wdTue') },
    { dayOfWeek: 3, label: t('compSch.wdWed') },
    { dayOfWeek: 4, label: t('compSch.wdThu') },
    { dayOfWeek: 5, label: t('compSch.wdFri') },
    { dayOfWeek: 6, label: t('compSch.wdSat') },
    { dayOfWeek: 0, label: t('compSch.wdSun') },
  ], [t]);

  const toggleDay = (dayOfWeek: number) => {
    setDirty(true);
    setWindows((current) => {
      const hasDay = current.some((window) => window.day_of_week === dayOfWeek);
      if (hasDay) return current.filter((window) => window.day_of_week !== dayOfWeek);
      return [...current, { day_of_week: dayOfWeek, start_time: '16:00', end_time: '20:00' }];
    });
  };

  const updateWindow = (dayOfWeek: number, patch: Partial<StudentPreferredWindow>) => {
    setDirty(true);
    setWindows((current) => current.map((window) => (
      window.day_of_week === dayOfWeek ? { ...window, ...patch } : window
    )));
  };

  const invalid = windows.some((window) => window.start_time >= window.end_time);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-indigo-500" />
          {t('compStu.availabilityTitle')}
        </h4>
      </div>
      <p className="text-xs text-gray-500 mb-3">{t('compStu.availabilityHint')}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {weekdays.map((weekday) => {
          const active = windows.some((window) => window.day_of_week === weekday.dayOfWeek);
          return (
            <button
              key={weekday.dayOfWeek}
              type="button"
              onClick={() => toggleDay(weekday.dayOfWeek)}
              className={cn(
                'min-w-12 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                active ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-950 hover:bg-indigo-200',
              )}
            >
              {weekday.label}
            </button>
          );
        })}
      </div>

      {windows.length > 0 && (
        <div className="space-y-2 mb-3">
          {weekdays
            .filter((weekday) => windows.some((window) => window.day_of_week === weekday.dayOfWeek))
            .map((weekday) => {
              const window = windows.find((w) => w.day_of_week === weekday.dayOfWeek)!;
              return (
                <div
                  key={weekday.dayOfWeek}
                  className="grid grid-cols-[3.5rem_1fr_auto_1fr] items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2"
                  onWheel={(e) => e.stopPropagation()}
                >
                  <p className="text-xs font-semibold text-gray-700">{weekday.label}</p>
                  <TimeInput
                    value={window.start_time}
                    onChange={(value) => updateWindow(weekday.dayOfWeek, { start_time: value })}
                    minuteStep={15}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white"
                  />
                  <span className="text-gray-400">–</span>
                  <TimeInput
                    value={window.end_time}
                    onChange={(value) => updateWindow(weekday.dayOfWeek, { end_time: value })}
                    minuteStep={15}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white"
                  />
                </div>
              );
            })}
        </div>
      )}

      {windows.length === 0 && (
        <p className="text-xs text-gray-400 mb-3">{t('compStu.availabilityEmpty')}</p>
      )}
      {invalid && (
        <p className="text-xs text-red-500 mb-2">{t('compStu.availabilityInvalidRange')}</p>
      )}

      {dirty && (
        <Button
          type="button"
          size="sm"
          className="rounded-xl"
          disabled={saving || invalid}
          onClick={() => void onSave(windows).then(() => setDirty(false))}
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('compStu.availabilitySave')
          )}
        </Button>
      )}
      <Label className="sr-only">{t('compStu.availabilityTitle')}</Label>
    </div>
  );
}
