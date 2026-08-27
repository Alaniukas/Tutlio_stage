import { Plus, X } from 'lucide-react';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { CompactTimeSelect } from '@/components/TimeSpinner';
import {
  formatScheduleLabel,
  type ExtraLessonsScheduleSlot,
} from '@/lib/extraLessonsContract';
import {
  addGroupScheduleSlot,
  addMinutesToTime,
  removeGroupScheduleSlot,
  updateGroupScheduleSlot,
} from '@/lib/schoolClassGroups';

const WEEKDAYS_LT = [
  { v: 1, label: 'Pirmadienis' },
  { v: 2, label: 'Antradienis' },
  { v: 3, label: 'Trečiadienis' },
  { v: 4, label: 'Ketvirtadienis' },
  { v: 5, label: 'Penktadienis' },
];

export function ScheduleSlotPicker(props: {
  slots: ExtraLessonsScheduleSlot[];
  onChange: (slots: ExtraLessonsScheduleSlot[]) => void;
  durationMinutes?: number;
  weekdays?: { v: number; label: string }[];
  addLabel?: string;
  removeLabel?: string;
  weekdayLabel?: string;
  untilLabel?: (time: string) => string;
  hideSummary?: boolean;
  allowEmpty?: boolean;
}) {
  const duration = Math.max(15, Number(props.durationMinutes) || 45);
  const weekdays = props.weekdays?.length ? props.weekdays : WEEKDAYS_LT;
  const weekdayValues = weekdays.map((day) => day.v);
  const addLabel = props.addLabel || 'Pridėti dieną';
  const removeLabel = props.removeLabel || 'Pašalinti dieną';
  const weekdayLabel = props.weekdayLabel || 'Diena';
  const allowEmpty = props.allowEmpty !== false;
  const untilLabel = props.untilLabel || ((time: string) => `Iki ${time}`);

  const emit = (next: ExtraLessonsScheduleSlot[]) => {
    props.onChange(next.map((slot) => {
      const start = String(slot.start_time || '16:00').slice(0, 5);
      return {
        weekday: Number(slot.weekday),
        start_time: start,
        end_time: addMinutesToTime(start, duration),
      };
    }));
  };

  const label = formatScheduleLabel(props.slots);

  return (
    <div className="space-y-2">
      {props.slots.map((slot, index) => {
        const start = String(slot.start_time || '16:00').slice(0, 5);
        const end = addMinutesToTime(start, duration);
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              className="border rounded-xl h-10 px-2 text-sm bg-white min-w-[9.5rem]"
              value={Number(slot.weekday)}
              onChange={(e) => emit(updateGroupScheduleSlot(props.slots, index, { weekday: Number(e.target.value) }, duration))}
              aria-label={weekdayLabel}
            >
              {weekdays.map((day) => (
                <option key={day.v} value={day.v}>{day.label}</option>
              ))}
            </select>
            <CompactTimeSelect
              value={start}
              onChange={(startTime) => emit(updateGroupScheduleSlot(props.slots, index, { start_time: startTime }, duration))}
              minuteStep={5}
            />
            <span className="text-xs text-gray-500">{untilLabel(end)}</span>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-1"
              onClick={() => emit(removeGroupScheduleSlot(props.slots, index, { allowEmpty }))}
              disabled={!allowEmpty && props.slots.length <= 1}
              aria-label={removeLabel}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 font-medium"
        onClick={() => emit(addGroupScheduleSlot(props.slots, duration, weekdayValues))}
      >
        <Plus className="w-4 h-4" />
        {addLabel}
      </button>
      {props.hideSummary ? null : label ? (
        <p className="text-xs text-gray-500">Sutartyje: <strong>{label}</strong></p>
      ) : (
        <p className="text-xs text-amber-700">Pasirinkite bent vieną savaitės dieną.</p>
      )}
    </div>
  );
}

export function DateRangeFields(props: {
  startDate: string;
  endDate: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label>Pradžios data</Label>
        <DateInput value={props.startDate} onChange={(e) => props.onStart(e.target.value)} className="rounded-xl" />
      </div>
      <div>
        <Label>Pabaigos data</Label>
        <DateInput value={props.endDate} onChange={(e) => props.onEnd(e.target.value)} className="rounded-xl" />
      </div>
    </div>
  );
}
