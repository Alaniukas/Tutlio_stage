import * as React from "react"
import { CalendarDays } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTranslation } from "@/lib/i18n"

export interface DateInputProps {
  value?: string
  onChange?: (e: { target: { value: string } }) => void
  min?: string
  max?: string
  disabled?: boolean
  className?: string
  id?: string
}

function parseDateValue(value: string): Date | undefined {
  const parts = value.split("-")
  if (parts.length !== 3) return undefined
  const [y, m, d] = parts.map(Number)
  const date = new Date(y, m - 1, d)
  return isNaN(date.getTime()) ? undefined : date
}

function DateInput({ value, onChange, min, max, disabled, className, id }: DateInputProps) {
  const [open, setOpen] = React.useState(false)
  const { dateFnsLocale } = useTranslation()

  const selectedDate = value ? parseDateValue(value) : undefined
  const minDate = min ? parseDateValue(min) : undefined
  const maxDate = max ? parseDateValue(max) : undefined

  const disabledDays: Array<{ before: Date } | { after: Date }> = []
  if (minDate) disabledDays.push({ before: minDate })
  if (maxDate) disabledDays.push({ after: maxDate })

  const handleSelect = (date: Date | undefined) => {
    const formatted = date ? format(date, "yyyy-MM-dd") : ""
    onChange?.({ target: { value: formatted } })
    setOpen(false)
  }

  const displayValue = selectedDate
    ? format(selectedDate, "P", { locale: dateFnsLocale })
    : undefined

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
            {displayValue || "yyyy-mm-dd"}
          </span>
          <CalendarDays className="ml-auto h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={disabledDays.length > 0 ? disabledDays : undefined}
          defaultMonth={selectedDate}
        />
      </PopoverContent>
    </Popover>
  )
}

DateInput.displayName = "DateInput"

export { DateInput }
