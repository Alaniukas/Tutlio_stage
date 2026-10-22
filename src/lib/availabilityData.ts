import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilityCalendarRow } from './availabilityCalendarBlocks.js';
import { fetchAllRows } from './fetchAllRows.js';

/** A large organization's later UUIDs must not silently disappear from its calendar. */
export async function loadAvailabilityForTutorIds(
  supabase: SupabaseClient,
  tutorIds: string[],
  signal?: AbortSignal,
): Promise<AvailabilityCalendarRow[]> {
  if (tutorIds.length === 0) return [];
  return fetchAllRows<AvailabilityCalendarRow>((from, to) => {
    const query = supabase.from('availability')
      .select('*').in('tutor_id', tutorIds).order('id', { ascending: true }).range(from, to);
    return signal ? query.abortSignal(signal) : query;
  }, Infinity);
}
