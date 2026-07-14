/**
 * Tutor matching helpers (pure / testable).
 *
 * Extracted from FindTutorModal so the slot computation can be unit-tested and
 * reused. Fixes accuracy gaps the inline version had: it now honours one-time
 * (`specific_date`) availability, recurring effective dates (`recurringAvailabilityAppliesOnDate`),
 * and per-slot `subject_ids` filtering — not just `day_of_week`.
 *
 * Also adds frequency-aware grouping: how many lessons per week a tutor can
 * cover, with the student's primary tutor ranked first.
 */
import { addDays, format, getISOWeek, getISOWeekYear, startOfDay, endOfDay } from 'date-fns';
import { recurringAvailabilityAppliesOnDate } from './availabilityRecurring';

export interface AvailabilityRule {
  tutor_id: string;
  day_of_week: number | null;
  start_time: string; // 'HH:MM' or 'HH:MM:SS'
  end_time: string;
  is_recurring?: boolean | null;
  specific_date?: string | null; // yyyy-MM-dd (one-time slots)
  end_date?: string | null;
  start_date?: string | null;
  created_at?: string | null;
  subject_ids?: string[] | null;
}

export interface BusyInterval {
  tutor_id: string;
  start: Date;
  end: Date;
}

export interface MatchSubject {
  id: string;
  name: string;
  price: number;
  tutor_id: string;
  duration_minutes?: number | null;
}

export interface MatchSlot {
  tutorId: string;
  subjectId: string;
  tutorName: string;
  subjectName: string;
  price: number;
  /** Minimum duration that must still fit after a newly booked interval is removed. */
  durationMinutes?: number;
  start: Date;
  end: Date;
}

export interface MatchParams {
  dateFrom: string; // yyyy-MM-dd
  dateTo: string; // yyyy-MM-dd
  timeFrom: string; // HH:MM
  timeTo: string; // HH:MM
  /** Empty / undefined => all subjects. */
  subjectName?: string;
  /**
   * Optional recurring weekly preferences. When supplied, only these weekday
   * windows are considered. Multiple windows for the same weekday are allowed.
   */
  preferredWindows?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
}

function parseHM(value: string): number {
  const [h, m] = String(value || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Compute the free availability windows for a set of tutors over a date/time
 * range. Busy intervals are subtracted from each availability window, so a day
 * with an existing lesson still surfaces the remaining free sub-windows (one
 * entry per free sub-window x matching subject that fits the subject duration).
 */
export function computeTutorSlots(
  availability: AvailabilityRule[],
  busy: BusyInterval[],
  subjects: MatchSubject[],
  tutorNames: Record<string, string>,
  params: MatchParams,
): MatchSlot[] {
  const from = startOfDay(new Date(params.dateFrom));
  const to = endOfDay(new Date(params.dateTo));
  const fromMinutes = parseHM(params.timeFrom);
  const toMinutes = parseHM(params.timeTo);

  const busyByTutor: Record<string, { start: Date; end: Date }[]> = {};
  for (const b of busy) {
    (busyByTutor[b.tutor_id] ||= []).push({ start: b.start, end: b.end });
  }

  const trimmedSubject = (params.subjectName || '').trim();
  const matchingSubjects = trimmedSubject
    ? subjects.filter((s) => s.name === trimmedSubject)
    : subjects;
  const tutorSubjectMap: Record<string, MatchSubject[]> = {};
  for (const s of matchingSubjects) {
    (tutorSubjectMap[s.tutor_id] ||= []).push(s);
  }

  const slots: MatchSlot[] = [];

  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const dayOfWeek = d.getDay();
    const dateStr = format(d, 'yyyy-MM-dd');
    const preferredWindows = params.preferredWindows?.length
      ? params.preferredWindows.filter((window) => window.dayOfWeek === dayOfWeek)
      : [{ dayOfWeek, startTime: params.timeFrom, endTime: params.timeTo }];
    if (preferredWindows.length === 0) continue;

    for (const avail of availability) {
      const isRecurring = avail.is_recurring !== false; // default true
      const applies = isRecurring
        ? recurringAvailabilityAppliesOnDate(avail, dateStr, dayOfWeek)
        : avail.specific_date === dateStr;
      if (!applies) continue;

      const tutorSubs = tutorSubjectMap[avail.tutor_id];
      if (!tutorSubs || tutorSubs.length === 0) continue;

      // If the rule restricts to specific subjects, only those subjects apply.
      const ruleSubjectIds = Array.isArray(avail.subject_ids)
        ? avail.subject_ids.filter(Boolean)
        : [];
      const subsForRule = ruleSubjectIds.length > 0
        ? tutorSubs.filter((s) => ruleSubjectIds.includes(s.id))
        : tutorSubs;
      if (subsForRule.length === 0) continue;

      for (const preferred of preferredWindows) {
        const availStart = Math.max(
          parseHM(avail.start_time),
          parseHM(preferred.startTime),
          fromMinutes,
        );
        const availEnd = Math.min(
          parseHM(avail.end_time),
          parseHM(preferred.endTime),
          toMinutes,
        );
        if (availEnd <= availStart) continue;

        const slotStart = new Date(d);
        slotStart.setHours(Math.floor(availStart / 60), availStart % 60, 0, 0);
        const slotEnd = new Date(d);
        slotEnd.setHours(Math.floor(availEnd / 60), availEnd % 60, 0, 0);

        // Subtract busy intervals from the window: a booked lesson no longer
        // hides the whole day, only the time it actually occupies.
        const tutorBusy = busyByTutor[avail.tutor_id] || [];
        let freeWindows: Array<{ start: Date; end: Date }> = [{ start: slotStart, end: slotEnd }];
        for (const b of tutorBusy) {
          if (b.end <= slotStart || b.start >= slotEnd) continue;
          const next: Array<{ start: Date; end: Date }> = [];
          for (const w of freeWindows) {
            if (b.end <= w.start || b.start >= w.end) {
              next.push(w);
              continue;
            }
            if (b.start > w.start) next.push({ start: w.start, end: b.start });
            if (b.end < w.end) next.push({ start: b.end, end: w.end });
          }
          freeWindows = next;
        }
        if (freeWindows.length === 0) continue;

        for (const sub of subsForRule) {
          const durationMin = Number(sub.duration_minutes) > 0 ? Number(sub.duration_minutes) : 60;
          const durMs = durationMin * 60_000;
          for (const w of freeWindows) {
            if (w.end.getTime() - w.start.getTime() < durMs) continue;
            slots.push({
              tutorId: avail.tutor_id,
              subjectId: sub.id,
              tutorName: tutorNames[avail.tutor_id] || '—',
              subjectName: sub.name,
              price: sub.price,
              durationMinutes: durationMin,
              start: w.start,
              end: w.end,
            });
          }
        }
      }
    }
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return slots;
}

/**
 * Remove newly booked intervals from already-rendered search results.
 *
 * The search modal can stay mounted behind the booking dialog, so its previous
 * results would otherwise remain visible until another database search. A busy
 * interval may split a larger free window into two usable results; fragments
 * shorter than the subject duration are discarded.
 */
export function subtractBusyFromMatchSlots(
  slots: MatchSlot[],
  busy: BusyInterval[],
): MatchSlot[] {
  const next: MatchSlot[] = [];

  for (const slot of slots) {
    let fragments: Array<{ start: Date; end: Date }> = [{ start: slot.start, end: slot.end }];
    for (const interval of busy) {
      if (interval.tutor_id !== slot.tutorId) continue;
      const updated: Array<{ start: Date; end: Date }> = [];
      for (const fragment of fragments) {
        if (interval.end <= fragment.start || interval.start >= fragment.end) {
          updated.push(fragment);
          continue;
        }
        if (interval.start > fragment.start) {
          updated.push({ start: fragment.start, end: interval.start });
        }
        if (interval.end < fragment.end) {
          updated.push({ start: interval.end, end: fragment.end });
        }
      }
      fragments = updated;
      if (fragments.length === 0) break;
    }

    const minimumDurationMs = (slot.durationMinutes || 60) * 60_000;
    for (const fragment of fragments) {
      if (fragment.end.getTime() - fragment.start.getTime() < minimumDurationMs) continue;
      next.push({ ...slot, start: fragment.start, end: fragment.end });
    }
  }

  return next.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface TutorMatchGroup {
  tutorId: string;
  tutorName: string;
  slots: MatchSlot[];
  /** Max distinct free days within a single ISO week across the searched range. */
  weeklyCoverage: number;
  /** Whether weeklyCoverage meets the requested lessons-per-week frequency. */
  coversFrequency: boolean;
  /** True when this is the active student's primary tutor. */
  isPrimary: boolean;
  /** Earliest available slot, in ms (for tie-break ranking). */
  earliestStart: number;
}

function isoWeekKey(d: Date): string {
  return `${getISOWeekYear(d)}-${getISOWeek(d)}`;
}

/**
 * Group slots by tutor and rank them:
 *   1. the student's primary tutor first,
 *   2. tutors who can cover the requested weekly frequency,
 *   3. higher weekly coverage,
 *   4. earliest availability.
 */
export function groupAndRankTutors(
  slots: MatchSlot[],
  opts: { frequencyPerWeek?: number; primaryTutorId?: string | null } = {},
): TutorMatchGroup[] {
  const freq = Math.max(1, Math.round(opts.frequencyPerWeek || 1));

  const byTutor: Record<string, MatchSlot[]> = {};
  for (const s of slots) {
    (byTutor[s.tutorId] ||= []).push(s);
  }

  const groups: TutorMatchGroup[] = Object.entries(byTutor).map(([tutorId, tutorSlots]) => {
    const weekDays: Record<string, Set<string>> = {};
    for (const s of tutorSlots) {
      const wk = isoWeekKey(s.start);
      (weekDays[wk] ||= new Set()).add(format(s.start, 'yyyy-MM-dd'));
    }
    const weeklyCoverage = Object.values(weekDays).reduce(
      (max, set) => Math.max(max, set.size),
      0,
    );
    const earliestStart = tutorSlots.reduce(
      (min, s) => Math.min(min, s.start.getTime()),
      Number.POSITIVE_INFINITY,
    );
    return {
      tutorId,
      tutorName: tutorSlots[0]?.tutorName || '—',
      slots: tutorSlots,
      weeklyCoverage,
      coversFrequency: weeklyCoverage >= freq,
      isPrimary: !!opts.primaryTutorId && tutorId === opts.primaryTutorId,
      earliestStart,
    };
  });

  groups.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.coversFrequency !== b.coversFrequency) return a.coversFrequency ? -1 : 1;
    if (b.weeklyCoverage !== a.weeklyCoverage) return b.weeklyCoverage - a.weeklyCoverage;
    return a.earliestStart - b.earliestStart;
  });

  return groups;
}
