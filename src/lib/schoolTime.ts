import { TZDate } from '@date-fns/tz';

export const SCHOOL_TIME_ZONE = 'Europe/Vilnius';

/** Parse form wall time in Lithuania; timestamps retain their actual instant. */
export function schoolDate(value: string | number | Date = Date.now()): TZDate {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) {
    const parts = value.split(/[-T:]/).map(Number);
    return new TZDate(parts[0], parts[1] - 1, parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0, SCHOOL_TIME_ZONE);
  }
  return new TZDate(typeof value === 'number' ? value : new Date(value).getTime(), SCHOOL_TIME_ZONE);
}
/** React Big Calendar uses browser-local Date arithmetic. Only its view receives this facade. */
export function schoolCalendarWallDate(value: Date): Date {
  const date = schoolDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

export function schoolCalendarInstant(wall: Date): TZDate {
  return new TZDate(wall.getFullYear(), wall.getMonth(), wall.getDate(), wall.getHours(), wall.getMinutes(), wall.getSeconds(), wall.getMilliseconds(), SCHOOL_TIME_ZONE);
}
