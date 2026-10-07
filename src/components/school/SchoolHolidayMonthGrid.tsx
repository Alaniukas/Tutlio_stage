import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { isSchoolHolidayDisplayDay, type SchoolOrgCalendarSettings } from '@/lib/schoolOrgCalendar';
import { cn } from '@/lib/utils';

export function buildSchoolHolidayMonthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<{ ymd: string | null; day: number | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ ymd: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ ymd, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ ymd: null, day: null });
  return cells;
}

type Props = {
  calendar: SchoolOrgCalendarSettings;
  viewYear: number;
  viewMonth: number;
  onViewChange: (year: number, month: number) => void;
  showLegend?: boolean;
};

export default function SchoolHolidayMonthGrid({
  calendar,
  viewYear,
  viewMonth,
  onViewChange,
  showLegend = true,
}: Props) {
  const { t, locale } = useTranslation();
  const cells = useMemo(() => buildSchoolHolidayMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    onViewChange(d.getUTCFullYear(), d.getUTCMonth());
  };

  const dayClass = (ymd: string | null) => {
    if (!ymd) return 'invisible';
    const holiday = isSchoolHolidayDisplayDay(ymd, calendar);
    const weekend = new Date(`${ymd}T12:00:00Z`).getUTCDay() === 0
      || new Date(`${ymd}T12:00:00Z`).getUTCDay() === 6;
    return cn(
      'flex h-8 w-8 items-center justify-center rounded-md text-xs',
      holiday && 'bg-rose-100 text-rose-900 font-medium ring-1 ring-rose-300',
      weekend && !holiday && 'text-gray-400',
    );
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)} aria-label={t('school.holidayCalendar.prevMonth')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-medium text-gray-800">{monthLabel}</p>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)} aria-label={t('school.holidayCalendar.nextMonth')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500 mb-1">
        {['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => (
          <div key={idx} className={dayClass(cell.ymd)}>
            {cell.day ?? ''}
          </div>
        ))}
      </div>
      {showLegend && (
        <p className="text-xs text-gray-500 mt-2">{t('school.holidayCalendar.legend')}</p>
      )}
    </div>
  );
}
