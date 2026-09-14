import { describe, it, expect } from 'vitest';
import {
  GOOGLE_CALENDAR_SYNC_STATUSES,
  googleCalendarSyncTimeMin,
} from '../../api/_lib/googleCalendarSyncWindow.js';

describe('googleCalendarSyncTimeMin', () => {
  it('includes the current Lithuanian school year start', () => {
    const timeMin = googleCalendarSyncTimeMin(new Date('2026-03-15T12:00:00+02:00'));
    expect(timeMin).toBe(new Date('2025-09-01T00:00:00+03:00').toISOString());
  });

  it('uses school-year start when it is earlier than the last 24 hours', () => {
    const timeMin = googleCalendarSyncTimeMin(new Date('2026-09-05T12:00:00+03:00'));
    expect(timeMin).toBe(new Date('2026-09-01T00:00:00+03:00').toISOString());
  });

  it('includes at least the last 24 hours on the first school-year day', () => {
    const now = new Date('2026-09-01T12:00:00+03:00');
    const timeMin = googleCalendarSyncTimeMin(now);
    const min24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(timeMin).toBe(min24h);
  });
});

describe('GOOGLE_CALENDAR_SYNC_STATUSES', () => {
  it('keeps completed lessons in full sync', () => {
    expect(GOOGLE_CALENDAR_SYNC_STATUSES).toContain('completed');
    expect(GOOGLE_CALENDAR_SYNC_STATUSES).toContain('no_show');
    expect(GOOGLE_CALENDAR_SYNC_STATUSES).not.toContain('cancelled');
  });
});
