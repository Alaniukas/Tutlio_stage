import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format, parseISO } from 'date-fns';
import { getAvailabilityRecurringStartDateStr } from './availabilityRecurring.js';
import { timeRangesOverlap } from './calendarFreeTimeFromSlot.js';
import { fetchAllRows } from './fetchAllRows.js';

export type AvailabilitySaveRule = {
  id?: string;
  tutor_id: string;
  is_recurring: boolean;
  day_of_week?: number | null;
  specific_date?: string | null;
  start_time: string;
  end_time: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
};

/** Date exceptions and weekly rules are separate layers; only peers conflict. */
export function availabilityRulesOverlap(
  a: AvailabilitySaveRule,
  b: AvailabilitySaveRule,
  today = format(new Date(), 'yyyy-MM-dd'),
): boolean {
  if (a.tutor_id !== b.tutor_id || a.is_recurring !== b.is_recurring) return false;
  if (!timeRangesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) return false;
  if (!a.is_recurring) return !!a.specific_date && a.specific_date === b.specific_date;
  if (a.day_of_week == null || a.day_of_week !== b.day_of_week) return false;

  const first = [today, getAvailabilityRecurringStartDateStr(a), getAvailabilityRecurringStartDateStr(b)].sort().at(-1)!;
  const last = [a.end_date, b.end_date].filter((date): date is string => !!date).sort()[0];
  if (last && first > last) return false;
  const start = parseISO(first);
  if (Number.isNaN(start.getTime())) return false;
  const nextOccurrence = format(addDays(start, (a.day_of_week - start.getDay() + 7) % 7), 'yyyy-MM-dd');
  return !last || nextOccurrence <= last;
}

/** Load the caller-visible rules again before saving, including every page. */
export async function hasAvailabilityConflict(
  supabase: SupabaseClient,
  candidate: AvailabilitySaveRule,
): Promise<boolean> {
  const rows = await fetchAllRows<AvailabilitySaveRule>((from, to) => {
    let query = supabase.from('availability')
      .select('id, tutor_id, is_recurring, day_of_week, specific_date, start_time, end_time, start_date, end_date, created_at')
      .eq('tutor_id', candidate.tutor_id)
      .eq('is_recurring', candidate.is_recurring);
    query = candidate.is_recurring
      ? query.eq('day_of_week', candidate.day_of_week)
      : query.eq('specific_date', candidate.specific_date);
    return query.order('id', { ascending: true }).range(from, to);
  }, Infinity);
  return rows.some((row) => row.id !== candidate.id && availabilityRulesOverlap(candidate, row));
}
