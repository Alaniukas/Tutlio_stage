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

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

async function applySegmentsToOneTimeRow(
  supabase: SupabaseClient,
  row: AvailabilityRow,
  segments: Array<{ start: string; end: string }>,
): Promise<void> {
  if (segments.length === 0) {
    const { error } = await supabase.from('availability').delete().eq('id', row.id);
    if (error) throw error;
    return;
  }
  if (segments.length === 1) {
    const { error } = await supabase
      .from('availability')
      .update({ start_time: segments[0].start, end_time: segments[0].end })
      .eq('id', row.id);
    if (error) throw error;
    return;
  }
  const { error: updateErr } = await supabase
    .from('availability')
    .update({ start_time: segments[0].start, end_time: segments[0].end })
    .eq('id', row.id);
  if (updateErr) throw updateErr;
  const { error: insertErr } = await supabase.from('availability').insert({
    tutor_id: row.tutor_id,
    specific_date: row.specific_date,
    start_time: segments[1].start,
    end_time: segments[1].end,
    is_recurring: false,
    subject_ids: row.subject_ids ?? [],
    meeting_link: row.meeting_link,
    public_bookable: row.public_bookable,
  });
  if (insertErr) throw insertErr;
}

async function insertSpecificDateSegments(
  supabase: SupabaseClient,
  row: AvailabilityRow,
  specificDate: string,
  segments: Array<{ start: string; end: string }>,
): Promise<void> {
  if (segments.length === 0) return;
  const { data: existingSpecific } = await supabase
    .from('availability')
    .select('id, start_time, end_time')
    .eq('tutor_id', row.tutor_id)
    .eq('is_recurring', false)
    .eq('specific_date', specificDate);
  for (const seg of segments) {
    const overlapsExisting = (existingSpecific || []).some((s) =>
      rangesOverlap(seg.start, seg.end, s.start_time as string, s.end_time as string),
    );
    if (overlapsExisting) continue;
    const { error } = await supabase.from('availability').insert({
      tutor_id: row.tutor_id,
      specific_date: specificDate,
      start_time: seg.start,
      end_time: seg.end,
      is_recurring: false,
      subject_ids: row.subject_ids ?? [],
      meeting_link: row.meeting_link,
      public_bookable: row.public_bookable,
    });
    if (error) throw error;
  }
}

export type ConsumeSessionSlotParams = {
  tutorId: string;
  startTime: string;
  endTime: string;
};

/**
 * Shortens overlapping availability when a lesson is booked inside free time.
 * One-time rows are trimmed in place; recurring rules get date-specific remainder rows.
 */
export async function consumeSessionSlotAvailability(
  supabase: SupabaseClient,
  params: ConsumeSessionSlotParams,
): Promise<void> {
  const { specificDate, startTime, endTime } = sessionInstantToAvailabilityFields(
    params.startTime,
    params.endTime,
  );
  const dayOfWeek = dayOfWeekFromDateStr(specificDate);

  const { data: rows, error } = await supabase
    .from('availability')
    .select('*')
    .eq('tutor_id', params.tutorId);
  if (error) throw error;

  for (const row of (rows || []) as AvailabilityRow[]) {
    const applies = row.is_recurring
      ? recurringAvailabilityAppliesOnDate(row, specificDate, dayOfWeek)
      : row.specific_date === specificDate;
    if (!applies) continue;
    if (!rangesOverlap(row.start_time, row.end_time, startTime, endTime)) continue;

    const segments = remainingSegments(row.start_time, row.end_time, startTime, endTime);
    if (row.is_recurring) {
      await insertSpecificDateSegments(supabase, row, specificDate, segments);
    } else {
      await applySegmentsToOneTimeRow(supabase, row, segments);
    }
  }
}

export async function consumeAvailabilityForCreatedSessions(
  supabase: SupabaseClient,
  tutorId: string,
  sessions: Array<{ start_time: string; end_time: string }>,
): Promise<void> {
  for (const session of sessions) {
    try {
      await consumeSessionSlotAvailability(supabase, {
        tutorId,
        startTime: session.start_time,
        endTime: session.end_time,
      });
    } catch (err) {
      console.error('[consumeAvailabilityForCreatedSessions]', err);
    }
  }
}
