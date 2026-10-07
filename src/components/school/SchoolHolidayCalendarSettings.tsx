import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/ui/date-input';
import { Trash2, Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { type SchoolOrgCalendarSettings } from '@/lib/schoolOrgCalendar';
import SchoolHolidayMonthGrid from '@/components/school/SchoolHolidayMonthGrid';

type Props = {
  value: SchoolOrgCalendarSettings;
  onChange: (next: SchoolOrgCalendarSettings) => void;
};

export default function SchoolHolidayCalendarSettings({ value, onChange }: Props) {
  const { t, locale } = useTranslation();
  const [pickerDate, setPickerDate] = useState('');
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const addDate = () => {
    const ymd = pickerDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    if (value.custom_closed_dates.includes(ymd)) return;
    onChange({
      ...value,
      custom_closed_dates: [...value.custom_closed_dates, ymd].sort(),
    });
    setPickerDate('');
  };

  const removeDate = (ymd: string) => {
    onChange({
      ...value,
      custom_closed_dates: value.custom_closed_dates.filter((d) => d !== ymd),
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('school.holidayCalendar.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('school.holidayCalendar.desc')}</p>
      </div>

      <label className="flex items-start gap-3">
        <Checkbox
          checked={value.include_lt_public_holidays}
          onChange={(event) => onChange({ ...value, include_lt_public_holidays: event.target.checked })}
        />
        <span className="text-sm text-gray-700">{t('school.holidayCalendar.ltHolidays')}</span>
      </label>

      <div className="space-y-2">
        <Label>{t('school.holidayCalendar.customClosed')}</Label>
        <div className="flex flex-wrap items-end gap-2">
          <DateInput value={pickerDate} onChange={(event) => setPickerDate(event.target.value)} className="w-40" />
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addDate} disabled={!pickerDate}>
            <Plus className="w-4 h-4" />
            {t('school.holidayCalendar.addDate')}
          </Button>
        </div>
        {value.custom_closed_dates.length === 0 ? (
          <p className="text-xs text-gray-500">{t('school.holidayCalendar.noCustom')}</p>
        ) : (
          <ul className="space-y-1">
            {value.custom_closed_dates.map((ymd) => (
              <li key={ymd} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-1.5 text-sm">
                <span>{new Date(`${ymd}T12:00:00`).toLocaleDateString(locale)}</span>
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-600"
                  onClick={() => removeDate(ymd)}
                  aria-label={t('school.holidayCalendar.removeDate')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-800 mb-2">{t('school.holidayCalendar.previewTitle')}</p>
        <SchoolHolidayMonthGrid
          calendar={value}
          viewYear={viewYear}
          viewMonth={viewMonth}
          onViewChange={(year, month) => {
            setViewYear(year);
            setViewMonth(month);
          }}
        />
      </div>
    </div>
  );
}
