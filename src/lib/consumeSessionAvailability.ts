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

function removeRowFromState(rows: AvailabilityRow[], id: string): void {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx >= 0) rows.splice(idx, 1);
}

function updateRowInState(rows: AvailabilityRow[], id: string, patch: Partial<AvailabilityRow>): void {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...patch };
}

async function applySegmentsToOneTimeRow(
  supabase: SupabaseClient,
  row: AvailabilityRow,
  segments: Array<{ start: string; end: string }>,
  rows: AvailabilityRow[],
): Promise<void> {
  if (segments.length === 0) {
    const { error } = await supabase.from('availability').delete().eq('id', row.id);
    if (error) throw error;
    removeRowFromState(rows, row.id);
    return;
  }
  if (segments.length === 1) {
    const { error } = await supabase
      .from('availability')
      .update({ start_time: segments[0].start, end_time: segments[0].end })
      .eq('id', row.id);
    if (error) throw error;
    updateRowInState(rows, row.id, { start_time: segments[0].start, end_time: segments[0].end });
    return;
  }
  const { error: updateErr } = await supabase
    .from('availability')
    .update({ start_time: segments[0].start, end_time: segments[0].end })
    .eq('id', row.id);
  if (updateErr) throw updateErr;
  updateRowInState(rows, row.id, { start_time: segments[0].start, end_time: segments[0].end });
  const { data: inserted, error: insertErr } = await supabase.from('availability').insert({
    tutor_id: row.tutor_id,
    specific_date: row.specific_date,
    start_time: segments[1].start,
    end_time: segments[1].end,
    is_recurring: false,
    subject_ids: row.subject_ids ?? [],
    meeting_link: row.meeting_link,
    public_bookable: row.public_bookable,
  }).select('id').single();
  if (insertErr) throw insertErr;
  if (inserted?.id) {
    rows.push({
      ...row,
      id: inserted.id as string,
      specific_date: row.specific_date,
      start_time: segments[1].start,
      end_time: segments[1].end,
      is_recurring: false,
    });
  }
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
    const applies = row.is_recurring
      ? recurringAvailabilityAppliesOnDate(row, specificDate, dayOfWeek)
      : row.specific_date === specificDate;
    if (!applies) continue;
    if (!rangesOverlap(row.start_time, row.end_time, startTime, endTime)) continue;

    const segments = remainingSegments(row.start_time, row.end_time, startTime, endTime);
    if (row.is_recurring) {
      await insertSpecificDateSegments(supabase, row, specificDate, segments, rows);
    } else {
      await applySegmentsToOneTimeRow(supabase, row, segments, rows);
    }
  }
}

/**
 * Shortens overlapping availability when a lesson is booked inside free time.
 * One-time rows are trimmed in place; recurring rules get date-specific remainder rows.
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

  // Different dates never mutate the same one-time availability row. Process a
  // few dates concurrently so a school-year series does not wait on 30-40
  // sequential database round trips. Sessions on the same date remain ordered
  // and share state, preserving the slot-splitting behaviour.
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
