import { useRef, useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { DateInput } from '@/components/ui/date-input';

interface TimeSpinnerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  minuteStep?: number;
}

const ITEM_HEIGHT = 36;
const VISIBLE_EXTRA = 2;
const WHEEL_STEP_THRESHOLD_PX = 80;
const WHEEL_STEP_COOLDOWN_MS = 120;
const WHEEL_GESTURE_RESET_MS = 180;

function SpinnerColumn({
  items,
  selectedIndex,
  onIndexChange,
  label,
}: {
  items: string[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startIndex = useRef(0);
  const selectedIndexRef = useRef(selectedIndex);
  const wheelDelta = useRef(0);
  const lastWheelStepAt = useRef(Number.NEGATIVE_INFINITY);
  const wheelResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const normalizedDelta = e.deltaY * (
        e.deltaMode === e.DOM_DELTA_LINE
          ? 16
          : e.deltaMode === e.DOM_DELTA_PAGE
            ? ITEM_HEIGHT
            : 1
      );
      if (normalizedDelta === 0) return;

      wheelDelta.current += normalizedDelta;
      if (wheelResetTimer.current) clearTimeout(wheelResetTimer.current);
      wheelResetTimer.current = setTimeout(() => {
        wheelDelta.current = 0;
      }, WHEEL_GESTURE_RESET_MS);

      const now = Date.now();
      if (
        Math.abs(wheelDelta.current) < WHEEL_STEP_THRESHOLD_PX ||
        now - lastWheelStepAt.current < WHEEL_STEP_COOLDOWN_MS
      ) {
        return;
      }

      const delta = wheelDelta.current > 0 ? 1 : -1;
      wheelDelta.current = 0;
      lastWheelStepAt.current = now;

      let newIndex = (selectedIndexRef.current + delta) % items.length;
      if (newIndex < 0) newIndex += items.length;
      selectedIndexRef.current = newIndex;
      onIndexChange(newIndex);
    },
    [items.length, onIndexChange]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (wheelResetTimer.current) clearTimeout(wheelResetTimer.current);
    };
  }, [handleWheel]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isEditing) return;
    isDragging.current = true;
    startY.current = e.clientY;
    startIndex.current = selectedIndex;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = Math.round((startY.current - e.clientY) / ITEM_HEIGHT);
    let newIndex = (startIndex.current + delta) % items.length;
    if (newIndex < 0) newIndex += items.length;
    onIndexChange(newIndex);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const offset = -selectedIndex * ITEM_HEIGHT + VISIBLE_EXTRA * ITEM_HEIGHT;
  const containerHeight = (VISIBLE_EXTRA * 2 + 1) * ITEM_HEIGHT;

  const handleDoubleClick = () => {
    setIsEditing(true);
    setInputVal(items[selectedIndex]);
  };

  const commitInput = () => {
    setIsEditing(false);
    const num = parseInt(inputVal);
    if (isNaN(num)) return;
    const padded = num.toString().padStart(2, '0');
    const idx = items.indexOf(padded);
    if (idx >= 0) {
      onIndexChange(idx);
    } else {
      let closest = 0;
      let minDiff = Infinity;
      items.forEach((item, i) => {
        const diff = Math.abs(parseInt(item) - num);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      });
      onIndexChange(closest);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</span>
      {isEditing ? (
        <input
          autoFocus
          type="number"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={commitInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInput();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          className="w-12 text-center text-lg font-bold text-indigo-600 border-b-2 border-indigo-500 bg-transparent focus:outline-none"
          style={{ height: containerHeight }}
        />
      ) : (
        <div
          ref={containerRef}
          className="relative select-none overflow-hidden"
          style={{ height: containerHeight, width: 44, cursor: 'ns-resize' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          title={t('time.doubleClickToType')}
        >
          <div
            className="absolute inset-x-0 top-0 z-10 pointer-events-none"
            style={{ height: ITEM_HEIGHT * VISIBLE_EXTRA, background: 'linear-gradient(to bottom, white 0%, rgba(255,255,255,0) 100%)' }}
          />
          <div
            className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
            style={{ height: ITEM_HEIGHT * VISIBLE_EXTRA, background: 'linear-gradient(to top, white 0%, rgba(255,255,255,0) 100%)' }}
          />
          <div
            className="absolute inset-x-1 z-0 rounded-lg border border-indigo-200 bg-indigo-50"
            style={{
              top: VISIBLE_EXTRA * ITEM_HEIGHT,
              height: ITEM_HEIGHT,
            }}
          />
          <div
            className="absolute w-full"
            style={{
              transform: `translateY(${offset}px)`,
              transition: isDragging.current ? 'none' : 'transform 0.15s ease',
            }}
          >
            {items.map((item, index) => (
              <div
                key={item}
                onClick={() => onIndexChange(index)}
                style={{ height: ITEM_HEIGHT, cursor: 'pointer' }}
                className={`flex items-center justify-center text-base font-medium transition-all ${index === selectedIndex
                  ? 'text-indigo-700 font-bold text-lg'
                  : Math.abs(index - selectedIndex) === 1
                    ? 'text-gray-500'
                    : 'text-gray-300'
                  }`}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      )}
      <span className="text-xs text-gray-300 mt-1">{t('time.scrollOrType')}</span>
    </div>
  );
}

/** Compact 24h hour:minute selects — no AM/PM, safe inside dialogs. */
export function CompactTimeSelect({
  value,
  onChange,
  minuteStep = 5,
}: TimeSpinnerProps) {
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes: string[] = [];
  for (let m = 0; m < 60; m += minuteStep) {
    minutes.push(m.toString().padStart(2, '0'));
  }

  const parts = (value || '08:00').split(':');
  const hour = (parts[0] || '08').padStart(2, '0');
  const rawMin = parseInt(parts[1] || '00', 10);
  let minute = minutes[0] || '00';
  let best = Infinity;
  minutes.forEach((opt) => {
    const diff = Math.abs(parseInt(opt, 10) - rawMin);
    if (diff < best) {
      best = diff;
      minute = opt;
    }
  });

  const selectClass =
    'h-10 min-w-[4.25rem] appearance-none rounded-xl border border-gray-200 bg-white px-3 pr-7 text-sm font-semibold tabular-nums text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  return (
    <div className="inline-flex items-center gap-1">
      <div className="relative">
        <select
          value={hours.includes(hour) ? hour : '08'}
          onChange={(e) => onChange(`${e.target.value}:${minute}`)}
          className={selectClass}
          aria-label="valandos"
        >
          {hours.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      </div>
      <span className="text-gray-400 font-semibold px-0.5">:</span>
      <div className="relative">
        <select
          value={minute}
          onChange={(e) => onChange(`${hours.includes(hour) ? hour : '08'}:${e.target.value}`)}
          className={selectClass}
          aria-label="minutės"
        >
          {minutes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      </div>
    </div>
  );
}

export default function TimeSpinner({ value, onChange, minuteStep = 1 }: TimeSpinnerProps) {
  const { t } = useTranslation();
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes: string[] = [];
  for (let m = 0; m < 60; m += minuteStep) {
    minutes.push(m.toString().padStart(2, '0'));
  }

  const parts = (value || '08:00').split(':');
  const hStr = parts[0] || '08';
  const mStr = parts[1] || '00';

  const hourIndex = Math.max(0, hours.indexOf(hStr.padStart(2, '0')));
  const mNum = parseInt(mStr);
  let minuteIndex = minutes.findIndex((m) => parseInt(m) >= mNum);
  if (minuteIndex < 0) minuteIndex = minutes.length - 1;

  const handleHourChange = (index: number) => {
    const newHour = hours[index];
    const currentMinute = minutes[minuteIndex] || '00';
    onChange(`${newHour}:${currentMinute}`);
  };

  const handleMinuteChange = (index: number) => {
    const newMinute = minutes[index];
    onChange(`${hStr.padStart(2, '0')}:${newMinute}`);
  };

  return (
    <div
      className="time-spinner-container inline-flex gap-2 py-3 px-2"
      onWheel={(e) => e.stopPropagation()}
    >
      <SpinnerColumn
        items={hours}
        selectedIndex={hourIndex}
        onIndexChange={handleHourChange}
        label={t('time.hours')}
      />
      <div className="flex items-center text-2xl font-bold text-gray-300 pb-4">:</div>
      <SpinnerColumn
        items={minutes}
        selectedIndex={minuteIndex}
        onIndexChange={handleMinuteChange}
        label={t('time.minutes')}
      />
    </div>
  );
}

interface DateTimeSpinnerProps {
  value: string; // "YYYY-MM-DDTHH:MM"
  onChange: (value: string) => void;
  label?: string;
}

export function DateTimeSpinner({ value, onChange, label }: DateTimeSpinnerProps) {
  const { t } = useTranslation();
  const [datePart, timePart] = value ? value.split('T') : ['', '08:00'];
  const timeValue = timePart ? timePart.slice(0, 5) : '08:00';

  const handleDateChange = (e: { target: { value: string } }) => {
    onChange(`${e.target.value}T${timeValue}`);
  };

  const handleTimeChange = (newTime: string) => {
    onChange(`${datePart}T${newTime}`);
  };

  return (
    <div
      className="flex flex-col gap-3"
      onWheel={(e) => e.stopPropagation()}
    >
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <div>
        <span className="text-xs text-gray-500 font-medium block mb-1.5">{t('time.date')}</span>
        <DateInput
          value={datePart}
          onChange={handleDateChange}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
        />
      </div>
      <div>
        <span className="text-xs text-gray-500 font-medium block mb-1 text-center">{t('time.timeHint')}</span>
        <div className="flex justify-center overflow-x-auto py-1" onWheel={(e) => e.stopPropagation()}>
          <TimeSpinner value={timeValue} onChange={handleTimeChange} minuteStep={1} />
        </div>
      </div>
    </div>
  );
}
