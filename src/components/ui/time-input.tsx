import * as React from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import TimeSpinner from "@/components/TimeSpinner"

export interface TimeInputProps {
  value?: string
  onChange?: (value: string) => void
  minuteStep?: number
  disabled?: boolean
  className?: string
  id?: string
}

function normalizeTime(value: string | undefined): string {
  if (!value) return "08:00"
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return "08:00"
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`
}

function TimeInput({ value, onChange, minuteStep = 1, disabled, className, id }: TimeInputProps) {
  const [open, setOpen] = React.useState(false)
  const safe = normalizeTime(value)

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
          <span className="tabular-nums text-foreground">{safe}</span>
          <Clock className="ml-auto h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="p-2" onWheel={(e) => e.stopPropagation()}>
          <TimeSpinner
            value={safe}
            onChange={(v) => onChange?.(v)}
            minuteStep={minuteStep}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

TimeInput.displayName = "TimeInput"

export { TimeInput }
