import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  addWeeks,
  format,
} from 'date-fns';
import { Calendar, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface DateRangeFilterProps {
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
  onClear: () => void;
  onSearch?: () => void;
  /** When set, presets and Search immediately apply this range (stats pages). */
  onApplyRange?: (start: Date, end: Date) => void;
  /** Merge with default Card styles (e.g. padding, shadow). */
  className?: string;
  /** Allow picking dates after today (stats forecast). */
  allowFuture?: boolean;
  /** Show next week / next month quick presets. */
  showFuturePresets?: boolean;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  onSearch,
  onApplyRange,
  className,
  allowFuture = false,
  showFuturePresets = false,
}: DateRangeFilterProps) {
  const applyRange = (start: Date, end: Date) => {
    onStartDateChange(start);
    onEndDateChange(end);
    onApplyRange?.(start, end);
  };
  const { t } = useTranslation();
  const today = new Date();
  const maxDate = format(today, 'yyyy-MM-dd');

  const presets = [
    {
      label: t('dateFilter.thisWeek'),
      onClick: () => {
        applyRange(
          startOfWeek(today, { weekStartsOn: 1 }),
          endOfWeek(today, { weekStartsOn: 1 }),
        );
      },
    },
    {
      label: t('dateFilter.thisMonth'),
      onClick: () => {
        applyRange(startOfMonth(today), endOfMonth(today));
      },
    },
    {
      label: t('dateFilter.lastMonth'),
      onClick: () => {
        const lastMonth = subMonths(today, 1);
        applyRange(startOfMonth(lastMonth), endOfMonth(lastMonth));
      },
    },
    {
      label: t('dateFilter.last3Months'),
      onClick: () => {
        applyRange(subMonths(today, 3), today);
      },
    },
    ...(showFuturePresets
      ? [
          {
            label: t('dateFilter.nextWeek'),
            onClick: () => {
              const nextWeek = addWeeks(today, 1);
              applyRange(
                startOfWeek(nextWeek, { weekStartsOn: 1 }),
                endOfWeek(nextWeek, { weekStartsOn: 1 }),
              );
            },
          },
          {
            label: t('dateFilter.nextMonth'),
            onClick: () => {
              const nextMonth = addMonths(today, 1);
              applyRange(startOfMonth(nextMonth), endOfMonth(nextMonth));
            },
          },
        ]
      : []),
  ];

  return (
    <Card className={cn('p-4 space-y-4', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
          <h3 className="font-semibold text-sm sm:text-base">{t('dateFilter.filterByPeriod')}</h3>
        </div>
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-8 px-2"
          >
            <X className="h-4 w-4 mr-1" />
            {t('common.clear')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            onClick={preset.onClick}
            className="text-xs"
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start-date">{t('dateFilter.fromDate')}</Label>
          <DateInput
            id="start-date"
            max={allowFuture ? undefined : maxDate}
            value={startDate ? format(startDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => {
              const value = e.target.value;
              onStartDateChange(value ? new Date(value) : null);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">{t('dateFilter.toDate')}</Label>
          <DateInput
            id="end-date"
            max={allowFuture ? undefined : maxDate}
            value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => {
              const value = e.target.value;
              onEndDateChange(value ? new Date(value) : null);
            }}
          />
        </div>
      </div>

      {startDate && endDate && startDate > endDate && (
        <p className="text-sm text-destructive">
          {t('dateFilter.startDateAfterEnd')}
        </p>
      )}

      {onSearch && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              if (!startDate || !endDate || startDate > endDate) return;
              onApplyRange?.(startDate, endDate);
              onSearch?.();
            }}
            disabled={!startDate || !endDate || (startDate > endDate)}
            className="gap-2 rounded-xl"
          >
            <Search className="h-4 w-4" />
            {t('common.search')}
          </Button>
        </div>
      )}
    </Card>
  );
}
