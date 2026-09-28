import type { SupabaseClient } from '@supabase/supabase-js';
import { recurringAvailabilityAppliesOnDate } from './availabilityRecurring';
import { sessionInstantToAvailabilityFields } from './releaseSessionAvailability';

type AvailabilityRow = {
  id: string;
  tutor_id: string;
  is_recurring: boolean | null;
  specific_date: string | null;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  subject_ids?: string[] | null;
  meeting_link?: string | null;
  public_bookable?: boolean | null;
};

function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}

function dayOfWeekFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function remainingSegments(
  ruleStart: string,
  ruleEnd: string,
  sessStart: string,
  sessEnd: string,
): Array<{ start: string; end: string }> {
  const rs = timeToMinutes(ruleStart);
  const re = timeToMinutes(ruleEnd);
  const ss = timeToMinutes(sessStart);
  const se = timeToMinutes(sessEnd);
  if (rs === null || re === null || ss === null || se === null) return [];
  const out: Array<{ start: string; end: string }> = [];
  if (ss > rs) out.push({ start: ruleStart, end: sessStart });
  if (se < re) out.push({ start: sessEnd, end: ruleEnd });
  return out.filter((seg) => {
    const a = timeToMinutes(seg.start);
    const b = timeToMinutes(seg.end);
    return a !== null && b !== null && b > a;
  });
}

async function insertSpecificDateSegments(
  supabase: SupabaseClient,
  row: AvailabilityRow,
  specificDate: string,
  segments: Array<{ start: string; end: string }>,
  rows: AvailabilityRow[],
): Promise<void> {
  if (segments.length === 0) return;
  const existingSpecific = rows.filter(
    (r) => r.tutor_id === row.tutor_id && !r.is_recurring && r.specific_date === specificDate,
  );
  for (const seg of segments) {
    const overlapsExisting = existingSpecific.some((s) =>
      rangesOverlap(seg.start, seg.end, s.start_time, s.end_time),
    );
    if (overlapsExisting) continue;
    const { data: inserted, error } = await supabase.from('availability').insert({
      tutor_id: row.tutor_id,
      specific_date: specificDate,
      start_time: seg.start,
      end_time: seg.end,
      is_recurring: false,
      subject_ids: row.subject_ids ?? [],
      meeting_link: row.meeting_link,
      public_bookable: row.public_bookable,
    }).select('id').single();
    if (error) throw error;
    if (inserted?.id) {
      const newRow: AvailabilityRow = {
        id: inserted.id as string,
        tutor_id: row.tutor_id,
        is_recurring: false,
        specific_date: specificDate,
        day_of_week: null,
        start_time: seg.start,
        end_time: seg.end,
        subject_ids: row.subject_ids ?? [],
        meeting_link: row.meeting_link,
        public_bookable: row.public_bookable,
      };
      rows.push(newRow);
      existingSpecific.push(newRow);
    }
  }
}

export type ConsumeSessionSlotParams = {
  tutorId: string;
  startTime: string;
  endTime: string;
};

async function consumeSessionSlotAvailabilityOnRows(
  supabase: SupabaseClient,
  params: ConsumeSessionSlotParams,
  rows: AvailabilityRow[],
): Promise<void> {
  const { specificDate, startTime, endTime } = sessionInstantToAvailabilityFields(
    params.startTime,
    params.endTime,
  );
  const dayOfWeek = dayOfWeekFromDateStr(specificDate);

  for (const row of rows) {
    if (row.tutor_id !== params.tutorId) continue;
    // The lesson masks booked time in calendar and booking views. Keeping the
    // source row lets deletion/cancellation reveal it with all original settings.
    if (!row.is_recurring) continue;
    if (!recurringAvailabilityAppliesOnDate(row, specificDate, dayOfWeek)) continue;
    if (!rangesOverlap(row.start_time, row.end_time, startTime, endTime)) continue;

    const segments = remainingSegments(row.start_time, row.end_time, startTime, endTime);
    await insertSpecificDateSegments(supabase, row, specificDate, segments, rows);
  }
}

/**
 * Keeps original availability when a lesson is booked inside free time.
 * Recurring rules retain their date-specific remainder rows. One-time rows are
 * masked by active lessons instead of being shortened or deleted.
 */
export async function consumeSessionSlotAvailability(
  supabase: SupabaseClient,
  params: ConsumeSessionSlotParams,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('availability')
    .select('*')
    .eq('tutor_id', params.tutorId);
  if (error) throw error;

  await consumeSessionSlotAvailabilityOnRows(
    supabase,
    params,
    [...((rows || []) as AvailabilityRow[])],
  );
}

export async function consumeAvailabilityForCreatedSessions(
  supabase: SupabaseClient,
  tutorId: string,
  sessions: Array<{ start_time: string; end_time: string }>,
): Promise<void> {
  if (sessions.length === 0) return;

  const { data: rows, error } = await supabase
    .from('availability')
    .select('*')
    .eq('tutor_id', tutorId);
  if (error) throw error;

  const loadedRows = [...((rows || []) as AvailabilityRow[])];
  const sessionsByDate = new Map<string, Array<{ start_time: string; end_time: string }>>();
  for (const session of sessions) {
    const { specificDate } = sessionInstantToAvailabilityFields(session.start_time, session.end_time);
    const sameDate = sessionsByDate.get(specificDate) || [];
    sameDate.push(session);
    sessionsByDate.set(specificDate, sameDate);
  }

  // Different dates never create the same one-time remainder row. Process a
  // few dates concurrently so a school-year series does not wait on 30-40
  // sequential database round trips. Sessions on the same date remain ordered
  // and share state, preventing duplicate remainder rows.
  const dateGroups = [...sessionsByDate.entries()];
  const workerCount = Math.min(6, dateGroups.length);
  let nextGroupIndex = 0;
  const worker = async () => {
    while (nextGroupIndex < dateGroups.length) {
      const groupIndex = nextGroupIndex;
      nextGroupIndex += 1;
      const [specificDate, sameDateSessions] = dateGroups[groupIndex];
      const state = loadedRows.filter(
        (row) => row.is_recurring || row.specific_date === specificDate,
      );
      for (const session of sameDateSessions) {
        try {
          await consumeSessionSlotAvailabilityOnRows(supabase, {
            tutorId,
            startTime: session.start_time,
            endTime: session.end_time,
          }, state);
        } catch (err) {
          console.error('[consumeAvailabilityForCreatedSessions]', err);
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
