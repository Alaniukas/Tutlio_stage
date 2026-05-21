import type { SupabaseClient } from '@supabase/supabase-js';

const VILNIUS_TZ = 'Europe/Vilnius';

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

export type ReleaseSessionSlotParams = {
  tutorId: string;
  startTime: string;
  endTime: string;
  subjectId?: string | null;
};

export type ReleaseSessionSlotResult = {
  created: boolean;
  skippedReason?: 'past' | 'group_lesson' | 'overlap' | 'invalid_range';
};

/**
 * Creates a one-time availability block for a freed lesson slot so other students can book.
 */
export async function releaseSessionSlotAsAvailability(
  supabase: SupabaseClient,
  params: ReleaseSessionSlotParams,
): Promise<ReleaseSessionSlotResult> {
  const endMs = new Date(params.endTime).getTime();
  if (endMs <= Date.now()) {
    return { created: false, skippedReason: 'past' };
  }

  if (params.subjectId) {
    const { data: subject } = await supabase
      .from('subjects')
      .select('is_group')
      .eq('id', params.subjectId)
      .maybeSingle();
    if (subject?.is_group) {
      return { created: false, skippedReason: 'group_lesson' };
    }
  }

  const { specificDate, startTime, endTime } = sessionInstantToAvailabilityFields(
    params.startTime,
    params.endTime,
  );

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  if (startMin === null || endMin === null || startMin >= endMin) {
    return { created: false, skippedReason: 'invalid_range' };
  }

  const { data: existingSpecific } = await supabase
    .from('availability')
    .select('id, start_time, end_time')
    .eq('tutor_id', params.tutorId)
    .eq('is_recurring', false)
    .eq('specific_date', specificDate);

  if (existingSpecific?.length) {
    const hasOverlap = existingSpecific.some((s) =>
      rangesOverlap(startTime, endTime, s.start_time as string, s.end_time as string),
    );
    if (hasOverlap) {
      return { created: false, skippedReason: 'overlap' };
    }
  }

  const subjectIds = params.subjectId ? [params.subjectId] : [];

  const { error } = await supabase.from('availability').insert([
    {
      tutor_id: params.tutorId,
      specific_date: specificDate,
      start_time: startTime,
      end_time: endTime,
      is_recurring: false,
      subject_ids: subjectIds,
    },
  ]);

  if (error) {
    console.error('[releaseSessionSlotAsAvailability]', error);
    throw error;
  }

  return { created: true };
}
