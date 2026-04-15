import * as React from "react"
import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const hiddenRef = React.useRef<HTMLInputElement>(null)

    const openPicker = () => {
      if (props.disabled) return

      const input = hiddenRef.current
      if (!input) return

      input.focus()
      // showPicker is not supported everywhere; keep safe fallback.
      try {
        input.showPicker?.()
      } catch {
        // no-op
      }
      input.click()
    }

    const displayValue = value || ''

    return (
      <div className="relative">
        <button
          type="button"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openPicker()
            }
          }}
          disabled={props.disabled}
          className={cn(
            "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer transition-colors",
            "hover:bg-accent/50 hover:border-primary/40",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            props.disabled && "cursor-not-allowed opacity-50 hover:bg-background hover:border-input",
            className
          )}
        >
          <span className={displayValue ? "text-foreground" : "text-muted-foreground"}>
            {displayValue || "yyyy-mm-dd"}
          </span>
          <CalendarDays className="ml-auto h-4 w-4 text-muted-foreground" />
        </button>
        <input
          ref={(node) => {
            (hiddenRef as React.MutableRefObject<HTMLInputElement | null>).current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node
          }}
          type="date"
          value={value}
          onChange={onChange}
          className="pointer-events-none absolute inset-0 opacity-0"
          tabIndex={-1}
          {...props}
        />
      </div>
    )
  }
)
DateInput.displayName = "DateInput"

export { DateInput }
