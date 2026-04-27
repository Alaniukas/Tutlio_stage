import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  weekStartsOn = 1,
  ...props
}: CalendarProps) {
  const { dateFnsLocale } = useTranslation();
  const now = new Date();
  const defaultStartMonth = new Date(1950, 0);
  const defaultEndMonth = new Date(now.getFullYear() + 5, 11);

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      locale={dateFnsLocale}
      captionLayout={props.captionLayout ?? "dropdown"}
      startMonth={props.startMonth ?? defaultStartMonth}
      endMonth={props.endMonth ?? defaultEndMonth}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col",
        month: "space-y-3",
        month_caption: "relative flex h-10 items-center justify-center",
        caption: "relative flex h-10 items-center justify-center",
        caption_label: "sr-only",
        dropdowns: "inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1",
        dropdown_root: "relative",
        months_dropdown: "h-8 rounded-md border border-border bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring",
        years_dropdown: "h-8 rounded-md border border-border bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring",
        nav: "pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "pointer-events-auto h-8 w-8 rounded-full border border-border bg-background p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "pointer-events-auto h-8 w-8 rounded-full border border-border bg-background p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].range_end)]:rounded-r-md [&:has([aria-selected].outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        range_end: "range_end",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      formatters={{
        formatCaption: (month, options) => format(month, "yyyy MMMM", { locale: options?.locale }),
        ...props.formatters,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
