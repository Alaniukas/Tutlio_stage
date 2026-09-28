import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, subDays } from 'date-fns';

export interface CancelledCalendarSession {
  id: string;
  tutor_id: string;
  student_id: string;
  start_time: Date;
  end_time: Date;
  status: 'cancelled';
  paid: boolean;
  [field: string]: unknown;
}

/** Hidden cancellations belong in the cleanup list, without occupying the grid's row limit. */
export async function loadCancelledCalendarSessions(
  client: Pick<SupabaseClient, 'from'>,
  tutorId: string,
  now = new Date(),
): Promise<CancelledCalendarSession[]> {
  const rows: CancelledCalendarSession[] = [];
  const from = subDays(now, 420).toISOString();
  const until = addDays(now, 460).toISOString();
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from('sessions')
      .select('*')
      .eq('tutor_id', tutorId)
      .eq('status', 'cancelled')
      .gte('start_time', from)
      .lte('start_time', until)
      .order('start_time', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page.map((row) => ({
      ...row,
      start_time: new Date(row.start_time),
      end_time: new Date(row.end_time),
    }) as CancelledCalendarSession));
    if (page.length < pageSize) return rows;
  }
}
