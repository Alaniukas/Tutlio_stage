/**
 * Server-derived parts of a public landing page.
 *
 * Offerings, free slots and ratings are computed here rather than stored on the
 * `public_pages` row, so an owner cannot edit their way to a price or an
 * availability they don't actually have. Only the service-role client calls
 * this — never the browser.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DerivedOffering {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  publicPrice: number;
  group?: boolean;
}

export interface DerivedSlot {
  start: string;
  durationMinutes: number;
}

export interface DerivedPage {
  offerings: DerivedOffering[];
  slots: DerivedSlot[];
  reviews: never[];
  ratingCount: number;
  ratingAvg: number | null;
}

export const EMPTY_DERIVED: DerivedPage = {
  offerings: [], slots: [], reviews: [], ratingCount: 0, ratingAvg: null,
};

/** How far ahead the "next available times" strip looks, and how many it shows. */
const HORIZON_DAYS = 21;
const MAX_SLOTS = 12;

/* ---------------------------------------------------------------- */
/* Timezone helpers                                                  */
/* ---------------------------------------------------------------- */

/**
 * Milliseconds `timeZone` is ahead of UTC at the given instant.
 * Vercel runs in UTC, so availability rows — which store a bare wall-clock
 * `time` — would otherwise be read an hour or two off during Lithuanian summer.
 */
function tzOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asUtc - at.getTime();
}

/** The UTC instant of a wall-clock time on `dayIso` in `timeZone`. */
function zonedToUtc(dayIso: string, hh: number, mm: number, timeZone: string): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  const naive = new Date(`${dayIso}T${pad(hh)}:${pad(mm)}:00Z`);
  const guess = new Date(naive.getTime() - tzOffsetMs(naive, timeZone));
  // Re-resolve once: across a DST boundary the first offset can be the wrong side.
  const settled = tzOffsetMs(guess, timeZone);
  return new Date(naive.getTime() - settled);
}

/** Today's calendar date inside `timeZone`, as YYYY-MM-DD. */
function todayIsoIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

function addDaysIso(dayIso: string, n: number): string {
  const d = new Date(`${dayIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday, matching date-fns getDay() which the availability rows were written against. */
function dayOfWeekIso(dayIso: string): number {
  return new Date(`${dayIso}T12:00:00Z`).getUTCDay();
}

function parseHm(value: string): [number, number] {
  const [h, m] = String(value).split(':');
  return [Number(h) || 0, Number(m) || 0];
}

/* ---------------------------------------------------------------- */
/* Derivation                                                        */
/* ---------------------------------------------------------------- */

interface AvailabilityRow {
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_recurring: boolean | null;
  specific_date: string | null;
  end_date: string | null;
  public_bookable?: boolean | null;
}

/**
 * Offerings + free slots for a solo tutor.
 *
 * Organizations get {@link EMPTY_DERIVED}: their lessons belong to individual
 * tutors, so there is no single calendar to publish. An org page is a business
 * card plus the enquiry form.
 */
export async function deriveForTutor(
  supabase: SupabaseClient,
  tutorId: string,
  timeZone: string,
): Promise<DerivedPage> {
  const [{ data: subjects }, { data: availability }, { data: profile }] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name, duration_minutes, price')
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: true }),
    supabase
      .from('availability')
      .select('day_of_week, start_time, end_time, is_recurring, specific_date, end_date, public_bookable')
      .eq('tutor_id', tutorId)
      .eq('public_bookable', true),
    supabase
      .from('profiles')
      .select('min_booking_hours, break_between_lessons')
      .eq('id', tutorId)
      .maybeSingle(),
  ]);

  const offerings: DerivedOffering[] = (subjects || []).map((s: Record<string, unknown>) => ({
    id: String(s.id),
    title: String(s.name),
    durationMinutes: Number(s.duration_minutes) || 60,
    publicPrice: Number(s.price) || 0,
  }));

  const slots = await deriveSlots(
    supabase,
    tutorId,
    timeZone,
    (availability || []) as AvailabilityRow[],
    offerings,
    Number(profile?.min_booking_hours) || 1,
    Number(profile?.break_between_lessons) || 0,
  );

  // No reviews table exists yet, so the page shows its empty state rather than
  // an invented rating. Wiring real reviews is a separate piece of work.
  return { offerings, slots, reviews: [], ratingCount: 0, ratingAvg: null };
}

async function deriveSlots(
  supabase: SupabaseClient,
  tutorId: string,
  timeZone: string,
  availability: AvailabilityRow[],
  offerings: DerivedOffering[],
  minBookingHours: number,
  breakMinutes: number,
): Promise<DerivedSlot[]> {
  if (availability.length === 0) return [];

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86400000);

  const { data: sessions } = await supabase
    .from('sessions')
    .select('start_time, end_time')
    .eq('tutor_id', tutorId)
    .neq('status', 'cancelled')
    .gte('start_time', now.toISOString())
    .lte('start_time', horizonEnd.toISOString());

  // Busy ranges padded by the tutor's configured break, so we never advertise a
  // slot that would butt straight up against an existing lesson.
  const busy = (sessions || []).map((s: Record<string, unknown>) => ({
    start: new Date(String(s.start_time)).getTime() - breakMinutes * 60000,
    end: new Date(String(s.end_time)).getTime() + breakMinutes * 60000,
  }));

  // One slot length for the whole strip: the shortest lesson on offer, so the
  // advertised times fit every offering rather than only the longest one.
  const step = offerings.length
    ? Math.min(...offerings.map((o) => o.durationMinutes))
    : 60;

  const earliest = now.getTime() + minBookingHours * 3600000;
  const out: DerivedSlot[] = [];
  const startIso = todayIsoIn(timeZone);

  for (let i = 0; i <= HORIZON_DAYS && out.length < MAX_SLOTS; i++) {
    const dayIso = addDaysIso(startIso, i);
    const dow = dayOfWeekIso(dayIso);

    const rules = availability.filter((a) => {
      if (a.is_recurring) {
        if (a.day_of_week !== dow) return false;
        if (a.end_date && dayIso > a.end_date) return false;
        return true;
      }
      return a.specific_date === dayIso;
    });

    for (const rule of rules) {
      const [sh, sm] = parseHm(rule.start_time);
      const [eh, em] = parseHm(rule.end_time);
      const windowStart = zonedToUtc(dayIso, sh, sm, timeZone).getTime();
      const windowEnd = zonedToUtc(dayIso, eh, em, timeZone).getTime();

      for (let t = windowStart; t + step * 60000 <= windowEnd; t += step * 60000) {
        if (out.length >= MAX_SLOTS) break;
        if (t < earliest) continue;
        const slotEnd = t + step * 60000;
        const overlaps = busy.some((b) => t < b.end && slotEnd > b.start);
        if (overlaps) continue;
        out.push({ start: new Date(t).toISOString(), durationMinutes: step });
      }
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out.slice(0, MAX_SLOTS);
}
