import { JOIN_CLICK_WINDOW_BEFORE_MS } from './attendance';
import { SCHOOL_TIME_ZONE } from './schoolTime';

/** Public school lessons use the same clock as the school's timetable. */
export function schoolLessonDayLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString('lt-LT', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: SCHOOL_TIME_ZONE,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function schoolLessonTimeLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('lt-LT', {
    hour: '2-digit', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE,
  });
}

export function schoolJoinOpensAtLabel(iso: string): string {
  const startMs = Date.parse(iso);
  if (!Number.isFinite(startMs)) return '';
  return new Date(startMs - JOIN_CLICK_WINDOW_BEFORE_MS).toLocaleString('lt-LT', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE,
  });
}
