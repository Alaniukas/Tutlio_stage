import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { format, addWeeks, parseISO } from 'date-fns';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly';

interface RecurrenceFieldsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  frequency: RecurrenceFrequency;
  onFrequencyChange: (frequency: RecurrenceFrequency) => void;
  /** JS getDay() values (0=Sun..6=Sat); ignored when frequency is monthly. */
  weekdays: number[];
  onWeekdaysChange: (weekdays: number[]) => void;
  /** '' = open-ended (default) — the rolling job keeps materializing lessons. */
  endDate: string;
  onEndDateChange: (endDate: string) => void;
  /** First lesson start ('yyyy-MM-ddTHH:mm'): default weekday on enable + min end date. */
  startTime?: string;
  /** Tutor calendar's "Bus sukurta ≈N pamokų" estimate below the end date. */
  showEstimate?: boolean;
  /** Tighter paddings for narrow dialogs. */
  compact?: boolean;
}

/**
 * Shared recurrence controls for every lesson-creation surface (org schedule,
 * tutor calendar, student-card booking) so the options never diverge again.
 * State stays in the parent; this component owns only the markup and the
 * toggle reset behavior.
 */
export default function RecurrenceFields({
  enabled,
  onEnabledChange,
  frequency,
  onFrequencyChange,
  weekdays,
  onWeekdaysChange,
  endDate,
  onEndDateChange,
  startTime,
  showEstimate,
  compact,
}: RecurrenceFieldsProps) {
  const { t } = useTranslation();

  const handleToggle = () => {
    const next = !enabled;
    onEnabledChange(next);
    onEndDateChange('');
    onFrequencyChange('weekly');
    if (next && startTime) {
      const start = new Date(startTime);
      onWeekdaysChange(Number.isNaN(start.getTime()) ? [] : [start.getDay()]);
    } else {
      onWeekdaysChange([]);
    }
  };

  return (
    <div className={cn('border border-gray-100 rounded-xl space-y-3 bg-gray-50', compact ? 'p-3' : 'p-3 sm:p-4')}>
      <button type="button" onClick={handleToggle} className="flex items-center justify-between w-full">
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900">{t('cal.recurringLesson')}</p>
          <p className="text-xs text-gray-500">{t('cal.recurringDesc')}</p>
        </div>
        <div className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 ml-4 ${enabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </div>
      </button>

      {enabled && (
        <div className="space-y-3 pt-1 border-t border-gray-200">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('cal.recurringFrequencyLabel')}</Label>
            <select
              value={frequency}
              onChange={(e) => onFrequencyChange(e.target.value as RecurrenceFrequency)}
              className="w-full rounded-xl text-sm border border-gray-300 px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="weekly">{t('cal.freqWeekly')}</option>
              <option value="biweekly">{t('cal.freqBiweekly')}</option>
              <option value="monthly">{t('cal.freqMonthly')}</option>
            </select>
          </div>
          {frequency !== 'monthly' && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('cal.weekdaysLabel')}</Label>
              <div className="flex gap-1.5 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const labels = [
                    t('cal.wdSun'),
                    t('cal.wdMon'),
                    t('cal.wdTue'),
                    t('cal.wdWed'),
                    t('cal.wdThu'),
                    t('cal.wdFri'),
                    t('cal.wdSat'),
                  ];
                  const isSelected = weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        onWeekdaysChange(
                          isSelected ? weekdays.filter((d) => d !== day) : [...weekdays, day],
                        );
                      }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                        isSelected
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
                      )}
                    >
                      {labels[day]}
                    </button>
                  );
                })}
              </div>
              {weekdays.length === 0 && (
                <p className="text-xs text-amber-600">{t('cal.selectAtLeastOneDay')}</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('compSch.repeatsUntilOptional')}</Label>
            <DateInput
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={startTime ? format(addWeeks(new Date(startTime), 1), 'yyyy-MM-dd') : undefined}
              className="rounded-xl text-sm"
            />
            {!endDate && (
              <p className="text-xs text-gray-500">{t('cal.recurringNoEndHint')}</p>
            )}
            {showEstimate && endDate && startTime && (() => {
              const startMs = new Date(startTime).getTime();
              const endMs = parseISO(endDate).getTime();
              const diffMs = endMs - startMs;
              let countPerDay: number;
              if (frequency === 'monthly') {
                const s = new Date(startTime);
                const e = parseISO(endDate);
                countPerDay = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
              } else {
                const weekInterval = frequency === 'biweekly' ? 2 : 1;
                countPerDay = Math.floor(diffMs / (weekInterval * 7 * 24 * 60 * 60 * 1000)) + 1;
              }
              const daysCount = frequency !== 'monthly' && weekdays.length > 0 ? weekdays.length : 1;
              const count = countPerDay * daysCount;
              return (
                <p className="text-xs text-indigo-600 font-medium">
                  Bus sukurta ≈{count} pamok{count === 1 ? 'a' : 'os'}
                  {daysCount > 1 && ` (${daysCount} d/sav × ≈${countPerDay})`}
                </p>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
