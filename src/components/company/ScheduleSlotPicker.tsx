import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
import { Label } from '@/components/ui/label';
import {
  formatScheduleLabel,
  type ExtraLessonsScheduleSlot,
} from '@/lib/extraLessonsContract';

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
}) {
  const duration = Math.max(15, Number(props.durationMinutes) || 45);

  const toggleDay = (weekday: number) => {
    const exists = props.slots.find((s) => s.weekday === weekday);
    if (exists) {
      props.onChange(props.slots.filter((s) => s.weekday !== weekday));
      return;
    }
    const start = props.slots[0]?.start_time || '16:00';
    const [h, m] = start.split(':').map(Number);
    const endMin = h * 60 + m + duration;
    const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    props.onChange([...props.slots, { weekday, start_time: start, end_time: end }].sort((a, b) => a.weekday - b.weekday));
  };

  const setTime = (start_time: string) => {
    const [h, m] = start_time.split(':').map(Number);
    const endMin = (h || 0) * 60 + (m || 0) + duration;
    const end_time = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    props.onChange(props.slots.map((s) => ({ ...s, start_time, end_time })));
  };

  const label = formatScheduleLabel(props.slots);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS_LT.map((d) => {
          const on = props.slots.some((s) => s.weekday === d.v);
          return (
            <button
              key={d.v}
              type="button"
              className={`text-sm px-3 py-1.5 rounded-full border ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200'}`}
              onClick={() => toggleDay(d.v)}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-xs">
        <div>
          <Label className="text-xs text-gray-500">Pradžia</Label>
          <TimeInput
            value={props.slots[0]?.start_time || '16:00'}
            onChange={(v) => setTime(v)}
            className="rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Trukmė</Label>
          <div className="h-9 flex items-center text-sm text-gray-600">{duration} min.</div>
        </div>
      </div>
      {label ? (
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
