import type { SupabaseClient } from '@supabase/supabase-js';
import { TZDate } from '@date-fns/tz';
import { recurringAvailabilityAppliesOnDate } from './availabilityRecurring.js';

const VILNIUS_TZ = 'Europe/Vilnius';
const READ_PAGE_SIZE = 500;

/** Wall-clock date/time in Europe/Vilnius for availability rows (date + time columns). */
export function sessionInstantToAvailabilityFields(startIso: string, endIso: string): {
  specificDate: string;
  startTime: string;
  endTime: string;
} {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const specificDate = start.toLocaleDateString('en-CA', { timeZone: VILNIUS_TZ });
  const startTime = start.toLocaleTimeString('sv-SE', {
    timeZone: VILNIUS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const endTime = end.toLocaleTimeString('sv-SE', {
    timeZone: VILNIUS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { specificDate, startTime, endTime };
}

function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

type Range = { start: number; end: number };

type AvailabilityRow = {
  is_recurring?: boolean | null;
  specific_date?: string | null;
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

type OccupiedSessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string | null;
};

async function loadAvailabilityOnDate(
  supabase: SupabaseClient,
  tutorId: string,
  specificDate: string,
): Promise<AvailabilityRow[]> {
  const rows: AvailabilityRow[] = [];
  for (let offset = 0; ; offset += READ_PAGE_SIZE) {
    const { data, error } = await supabase.from('availability').select('*')
      .eq('tutor_id', tutorId)
      .or(`is_recurring.eq.true,specific_date.eq.${specificDate}`)
      .order('id', { ascending: true }).range(offset, offset + READ_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data || []) as AvailabilityRow[]));
    if (!data || data.length < READ_PAGE_SIZE) return rows;
  }
}

async function loadOccupiedSessionsOnDate(
  supabase: SupabaseClient,
  tutorId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<OccupiedSessionRow[]> {
  const rows: OccupiedSessionRow[] = [];
  for (let offset = 0; ; offset += READ_PAGE_SIZE) {
    const { data, error } = await supabase.from('sessions')
      .select('id, start_time, end_time, status').eq('tutor_id', tutorId)
      .lt('start_time', dayEnd.toISOString()).gt('end_time', dayStart.toISOString())
      .order('id', { ascending: true }).range(offset, offset + READ_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data || []) as OccupiedSessionRow[]));
    if (!data || data.length < READ_PAGE_SIZE) return rows;
  }
}

function availabilityRange(row: AvailabilityRow): Range | null {
  const start = timeToMinutes(row.start_time);
  const end = timeToMinutes(row.end_time);
  return start !== null && end !== null && start < end ? { start, end } : null;
}

function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

function subtractRanges(range: Range, covered: Range[]): Range[] {
  let remaining = [range];
  for (const other of covered) {
    remaining = remaining.flatMap((part) => {
      if (!overlaps(part, other)) return [part];
      const segments: Range[] = [];
      if (other.start > part.start) segments.push({ start: part.start, end: other.start });
      if (other.end < part.end) segments.push({ start: other.end, end: part.end });
      return segments;
    });
  }
  return remaining;
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export type ReleaseSessionSlotParams = {
  tutorId: string;
  startTime: string;
  endTime: string;
  subjectId?: string | null;
  meetingLink?: string | null;
  publicBookable?: boolean | null;
  /** Rows selected for deletion, or already moved away from the released time. */
  ignoredSessionIds?: string[];
};

export type ReleaseSessionSlotResult = {
  created: boolean;
  skippedReason?: 'past' | 'overlap' | 'occupied' | 'invalid_range';
};

/**
 * Restores only the uncovered parts of a freed lesson slot. Existing recurring
 * availability can refill naturally; one-time remainders need their gap restored.
 * Remaining lessons (including other group participants) always keep their time.
 */
export async function releaseSessionSlotAsAvailability(
  supabase: SupabaseClient,
  params: ReleaseSessionSlotParams,
): Promise<ReleaseSessionSlotResult> {
  const startMs = new Date(params.startTime).getTime();
  const endMs = new Date(params.endTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return { created: false, skippedReason: 'invalid_range' };
  }
  if (endMs <= Date.now()) {
    return { created: false, skippedReason: 'past' };
  }

  const { specificDate, startTime, endTime } = sessionInstantToAvailabilityFields(
    params.startTime,
    params.endTime,
  );

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const endDate = new Date(params.endTime).toLocaleDateString('en-CA', { timeZone: VILNIUS_TZ });
  if (startMin === null || endMin === null || startMin >= endMin || endDate !== specificDate) {
    return { created: false, skippedReason: 'invalid_range' };
  }

  const [year, month, day] = specificDate.split('-').map(Number);
  const dayStart = new TZDate(year, month - 1, day, VILNIUS_TZ);
  const dayEnd = new TZDate(year, month - 1, day + 1, VILNIUS_TZ);
  const [availability, sessions] = await Promise.all([
    loadAvailabilityOnDate(supabase, params.tutorId, specificDate),
    loadOccupiedSessionsOnDate(supabase, params.tutorId, dayStart, dayEnd),
  ]);
  const specific = availability.filter((row) => !row.is_recurring && row.specific_date === specificDate);
  const recurring = availability.filter((row) => row.is_recurring
    && recurringAvailabilityAppliesOnDate(row, specificDate, dayStart.getDay()));
  // A specific-date remainder overrides all recurring rules for this tutor/day.
  const effective = specific.length > 0 ? specific : recurring;
  const covered = effective.flatMap((row) => {
    const range = availabilityRange(row);
    return range ? [range] : [];
  });
  const ignoredIds = new Set(params.ignoredSessionIds || []);
  const occupied = sessions.flatMap((session) => {
    if (session.status === 'cancelled' || ignoredIds.has(session.id)) return [];
    const sessionStart = new Date(session.start_time).getTime();
    const sessionEnd = new Date(session.end_time).getTime();
    if (!Number.isFinite(sessionStart) || !Number.isFinite(sessionEnd) || sessionStart >= sessionEnd) return [];
    const fields = sessionInstantToAvailabilityFields(session.start_time, session.end_time);
    const start = sessionStart <= dayStart.getTime() ? 0 : timeToMinutes(fields.startTime);
    const end = sessionEnd >= dayEnd.getTime() ? 1440 : timeToMinutes(fields.endTime);
    return start !== null && end !== null && start < end ? [{ start, end }] : [];
  });
  const released = { start: startMin, end: endMin };
  const gaps = subtractRanges(released, [...covered, ...occupied]);
  if (gaps.length === 0) {
    return {
      created: false,
      skippedReason: occupied.some((range) => overlaps(range, released)) ? 'occupied' : 'overlap',
    };
  }

  const rowsToInsert: Array<Record<string, unknown>> = [];
  const insertedRanges: Range[] = [];
  const append = (range: Range, source?: AvailabilityRow) => {
    rowsToInsert.push({
      tutor_id: params.tutorId,
      specific_date: specificDate,
      start_time: minutesToTime(range.start),
      end_time: minutesToTime(range.end),
      is_recurring: false,
      subject_ids: source?.subject_ids ?? (params.subjectId ? [params.subjectId] : []),
      meeting_link: source?.meeting_link ?? params.meetingLink ?? null,
      public_bookable: source?.public_bookable ?? params.publicBookable ?? false,
    });
    insertedRanges.push(range);
  };

  if (specific.length === 0) {
    // Creating the first one-time row replaces the day's recurring rules in
    // calendar views. Preserve their other free windows with the same metadata.
    for (const row of recurring) {
      const range = availabilityRange(row);
      if (!range) continue;
      for (const part of subtractRanges(range, [...occupied, ...insertedRanges])) append(part, row);
    }
  }

  for (const gap of gaps) {
    const matchesSubject = (row: AvailabilityRow) => !params.subjectId
      || !row.subject_ids?.length || row.subject_ids.includes(params.subjectId);
    const adjacent = specific.find((row) => {
      const range = availabilityRange(row);
      return range && matchesSubject(row) && (range.start === gap.end || range.end === gap.start);
    });
    const recurringSource = recurring.find((row) => {
      const range = availabilityRange(row);
      return range && matchesSubject(row) && overlaps(range, gap);
    });
    append(gap, adjacent || recurringSource);
  }

  const { error } = await supabase.from('availability').insert(rowsToInsert);

  if (error) {
    console.error('[releaseSessionSlotAsAvailability]', error);
    throw error;
  }

  return { created: true };
}
