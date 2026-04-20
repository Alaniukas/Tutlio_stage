import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n";

export interface MonthInputProps {
  value?: string; // yyyy-MM
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function parseMonthValue(value: string): Date | undefined {
  const parts = value.split("-");
  if (parts.length !== 2) return undefined;
  const [y, m] = parts.map(Number);
  const date = new Date(y, m - 1, 1);
  return isNaN(date.getTime()) ? undefined : date;
}

function MonthInput({ value, onChange, disabled, className, id }: MonthInputProps) {
  const [open, setOpen] = React.useState(false);
  const { dateFnsLocale } = useTranslation();

  const selectedMonth = value ? parseMonthValue(value) : undefined;
  const [displayYear, setDisplayYear] = React.useState(
    selectedMonth?.getFullYear() ?? new Date().getFullYear()
  );

  React.useEffect(() => {
    if (selectedMonth) {
      setDisplayYear(selectedMonth.getFullYear());
    }
  }, [selectedMonth]);

  const handleSelect = (monthIndex: number) => {
    const date = new Date(displayYear, monthIndex, 1);
    const formatted = format(date, "yyyy-MM");
    onChange?.({ target: { value: formatted } });
    setOpen(false);
  };

  const monthLabels = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        format(new Date(displayYear, i, 1), "LLL", { locale: dateFnsLocale })
      ),
    [dateFnsLocale, displayYear]
  );

  const displayValue = selectedMonth
    ? format(selectedMonth, "yyyy-MM")
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer transition-colors",
            "hover:bg-accent/50 hover:border-primary/40",
            "focus:ring-2 focus:ring-ring focus:ring-offset-2",
            disabled && "cursor-not-allowed opacity-50 hover:bg-background hover:border-input",
            className
          )}
        >
          <span className={displayValue ? "text-foreground" : "text-muted-foreground"}>
            {displayValue || "yyyy-mm"}
          </span>
          <CalendarDays className="ml-auto h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setDisplayYear((y) => y - 1)}
            className="h-8 w-8 rounded-md border border-gray-200 hover:bg-gray-50 flex items-center justify-center"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900">{displayYear}</span>
          <button
            type="button"
            onClick={() => setDisplayYear((y) => y + 1)}
            className="h-8 w-8 rounded-md border border-gray-200 hover:bg-gray-50 flex items-center justify-center"
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {monthLabels.map((label, idx) => {
            const isSelected =
              selectedMonth &&
              selectedMonth.getFullYear() === displayYear &&
              selectedMonth.getMonth() === idx;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleSelect(idx)}
                className={cn(
                  "h-9 rounded-md text-sm transition-colors border",
                  isSelected
                    ? "bg-orange-500 text-white border-orange-500"
                    : "border-transparent hover:bg-gray-100 text-gray-800"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

MonthInput.displayName = "MonthInput";

export { MonthInput };
