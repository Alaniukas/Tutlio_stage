import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSameSlotPeerIdMap, hasOverlapWithExclusions, type SessionIntervalRow } from './calendarSessionOverlap';
import { planRecurringSeriesPatches, sortSeriesPatchesForApply } from './recurringSessions';

const PAGE_SIZE = 500;
type SessionClient = Pick<SupabaseClient, 'from'>;

export class CalendarSeriesConflictError extends Error {
  constructor(public readonly start: Date, public readonly end: Date) {
    super('Session time conflict');
  }
}

export async function loadFutureCalendarSeries(
  client: SessionClient,
  scope: { tutorId: string; from: Date; recurringIds: string[]; subjectId: string | null },
): Promise<SessionIntervalRow[]> {
  const rows: SessionIntervalRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client.from('sessions').select('id, start_time, end_time')
      .eq('tutor_id', scope.tutorId)
      .eq('status', 'active')
      .gte('start_time', scope.from.toISOString());
    if (scope.recurringIds.length) {
      query = query.in('recurring_session_id', scope.recurringIds);
    } else {
      query = query.eq('subject_id', scope.subjectId);
    }
    const { data, error } = await query.order('start_time').order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Validate the whole proposed schedule before writing any occurrence. */
export async function applyCalendarSeriesEdit(
  client: SessionClient,
  params: {
    tutorId: string;
    rows: SessionIntervalRow[];
    edited: SessionIntervalRow;
    next: { start: Date; end: Date };
    fields: Record<string, unknown>;
  },
): Promise<string[]> {
  const { rows, edited, next } = params;
  if (!rows.length) throw new Error('No editable sessions');
  if (!Number.isFinite(next.start.getTime()) || !Number.isFinite(next.end.getTime()) || next.end <= next.start) {
    throw new Error('Invalid session interval');
  }
  const patches = sortSeriesPatchesForApply(
    planRecurringSeriesPatches(rows, edited, next, params.fields), rows,
  );
  const proposed = patches.flatMap(({ id, patch }) => (
    typeof patch.start_time === 'string' && typeof patch.end_time === 'string'
      ? [{ id, start_time: patch.start_time, end_time: patch.end_time }]
      : []
  ));

  if (proposed.length) {
    const excludedIds = new Set(rows.map(row => row.id));
    const peers = buildSameSlotPeerIdMap(rows);
    const rangeStart = new Date(Math.min(...proposed.map(row => Date.parse(row.start_time))));
    const rangeEnd = new Date(Math.max(...proposed.map(row => Date.parse(row.end_time))));
    const busy: SessionIntervalRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client.from('sessions').select('id, start_time, end_time')
        .eq('tutor_id', params.tutorId).neq('status', 'cancelled')
        .lt('start_time', rangeEnd.toISOString()).gt('end_time', rangeStart.toISOString())
        .order('start_time').order('id').range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      busy.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }

    for (const row of proposed) {
      const start = new Date(row.start_time);
      const end = new Date(row.end_time);
      // All edited rows leave their old slots. Compare the proposed rows with
      // each other as well, preserving the shared slot of group participants.
      if (hasOverlapWithExclusions(start, end, busy, excludedIds)
        || hasOverlapWithExclusions(start, end, proposed, peers.get(row.id) ?? new Set([row.id]))) {
        throw new CalendarSeriesConflictError(start, end);
      }
    }
  }

  const updatedIds: string[] = [];
  for (const { id, patch } of patches) {
    const { data, error } = await client.from('sessions').update(patch).eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Session update not permitted');
    updatedIds.push(id);
  }
  return updatedIds;
}
