import { format, parseISO } from 'date-fns';

/**
 * First day when a recurring availability rule is effective (inclusive).
 * If start_date is absent — use the created_at calendar day (not infinite past).
 */
export function getAvailabilityRecurringStartDateStr(rule: {
  start_date?: string | null;
  created_at?: string | null;
}): string {
  if (rule.start_date) return rule.start_date;
  if (rule.created_at) {
    try {
      const d = parseISO(rule.created_at);
      if (Number.isNaN(d.getTime())) return '1970-01-01';
      return format(d, 'yyyy-MM-dd');
    } catch {
      return '1970-01-01';
    }
  }
  return '1970-01-01';
}

/** Whether a recurring rule is effective for a given day (dateStr = yyyy-MM-dd). */
export function recurringAvailabilityAppliesOnDate(
  rule: {
    day_of_week: number | null;
    end_date?: string | null;
    start_date?: string | null;
    created_at?: string | null;
  },
  dateStr: string,
  dayOfWeek: number
): boolean {
  if (rule.day_of_week !== dayOfWeek) return false;
  const start = getAvailabilityRecurringStartDateStr(rule);
  if (dateStr < start) return false;
  if (rule.end_date && dateStr > rule.end_date) return false;
  return true;
}
