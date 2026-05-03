import * as React from 'react';
import { CalendarRange } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

export interface MonthFilterInputProps {
  /** yyyy-MM or empty string = visi mėnesiai */
  value: string;
  onChange: (monthYyyyMm: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}

function parseMonthValue(v: string): Date | undefined {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return undefined;
  const [y, m] = v.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Mėnesio (ir metų) pasirinkimas be dienų — tik logiška mėnesio filtravimui.
 */
export function MonthFilterInput({ value, onChange, className, id, disabled }: MonthFilterInputProps) {
  const [open, setOpen] = React.useState(false);
  const { t, dateFnsLocale } = useTranslation();

  const [draftYear, setDraftYear] = React.useState(() => new Date().getFullYear());
  const [draftMonth, setDraftMonth] = React.useState(() => new Date().getMonth() + 1);

  const yearOptions = React.useMemo(() => {
    const now = new Date();
    const endY = now.getFullYear() + 5;
    const years: number[] = [];
    for (let y = endY; y >= 1950; y--) years.push(y);
    return years;
  }, []);

  const monthOptions = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: format(new Date(2020, i, 1), 'LLLL', { locale: dateFnsLocale }),
      })),
    [dateFnsLocale],
  );

  const syncDraftFromValue = React.useCallback(() => {
    const d = parseMonthValue(value) ?? new Date();
    setDraftYear(d.getFullYear());
    setDraftMonth(d.getMonth() + 1);
  }, [value]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) syncDraftFromValue();
  };

  const emit = (y: number, m: number) => {
    onChange(`${y}-${String(m).padStart(2, '0')}`);
  };

  const applyDraftAndClose = () => {
    emit(draftYear, draftMonth);
    setOpen(false);
  };

  const selectedMonthStart = parseMonthValue(value);
  const displayValue = selectedMonthStart
    ? format(selectedMonthStart, 'LLLL yyyy', { locale: dateFnsLocale })
    : undefined;

  // Radix Popover default modal=true treats native <select> dropdown as outside click — month never applies.
  return (
    <Popover modal={false} open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 min-w-[11rem] items-center rounded-lg border border-amber-200/80 bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer transition-colors',
            'hover:bg-amber-50/50 hover:border-amber-300/90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50 hover:bg-background hover:border-amber-200/80',
            className,
          )}
        >
          <span className={displayValue ? 'text-foreground' : 'text-muted-foreground'}>
            {displayValue || t('invoices.monthFilterPlaceholder')}
          </span>
          <CalendarRange className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex flex-col gap-3 min-w-[14rem]">
          <div className="space-y-1">
            <label htmlFor={id ? `${id}-year` : undefined} className="text-xs font-medium text-muted-foreground">
              {t('invoices.selectYear')}
            </label>
            <select
              id={id ? `${id}-year` : undefined}
              className={cn(
                'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm font-medium text-foreground',
                'outline-none focus:ring-2 focus:ring-ring',
              )}
              value={draftYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                setDraftYear(y);
                emit(y, draftMonth);
              }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={id ? `${id}-month` : undefined} className="text-xs font-medium text-muted-foreground">
              {t('invoices.selectMonth')}
            </label>
            <select
              id={id ? `${id}-month` : undefined}
              className={cn(
                'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm font-medium text-foreground',
                'outline-none focus:ring-2 focus:ring-ring',
              )}
              value={draftMonth}
              onChange={(e) => {
                const m = Number(e.target.value);
                setDraftMonth(m);
                emit(draftYear, m);
              }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" className="w-full rounded-lg" onClick={applyDraftAndClose}>
            {t('invoices.monthFilterApply')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

MonthFilterInput.displayName = 'MonthFilterInput';
