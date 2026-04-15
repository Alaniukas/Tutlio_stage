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
  /** Merge with default Card styles (e.g. padding, shadow). */
  className?: string;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  onSearch,
  className,
}: DateRangeFilterProps) {
  const { t } = useTranslation();
  const today = new Date();
  const maxDate = format(today, 'yyyy-MM-dd');

  const presets = [
    {
      label: t('dateFilter.thisWeek'),
      onClick: () => {
        onStartDateChange(startOfWeek(today, { weekStartsOn: 1 }));
        onEndDateChange(endOfWeek(today, { weekStartsOn: 1 }));
      },
    },
    {
      label: t('dateFilter.thisMonth'),
      onClick: () => {
        onStartDateChange(startOfMonth(today));
        onEndDateChange(endOfMonth(today));
      },
    },
    {
      label: t('dateFilter.lastMonth'),
      onClick: () => {
        const lastMonth = subMonths(today, 1);
        onStartDateChange(startOfMonth(lastMonth));
        onEndDateChange(endOfMonth(lastMonth));
      },
    },
    {
      label: t('dateFilter.last3Months'),
      onClick: () => {
        onStartDateChange(subMonths(today, 3));
        onEndDateChange(today);
      },
    },
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
            max={maxDate}
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
            max={maxDate}
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
            onClick={onSearch}
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
