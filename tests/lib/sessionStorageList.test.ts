import { describe, expect, it } from 'vitest';
import {
  SESSION_FILES_TAB_MAX_FOLDERS,
  orderSessionFileFolders,
  sessionsToScanForFilesTab,
  studentFilesPollIntervalMs,
} from '../../src/lib/sessionStorageList';

describe('studentFilesPollIntervalMs', () => {
  const start = Date.parse('2026-09-07T13:00:00.000Z');
  const end = Date.parse('2026-09-07T13:45:00.000Z');

  it('polls every 10s during the lesson (and shortly before/after)', () => {
    expect(studentFilesPollIntervalMs(start, { start, end })).toBe(10_000);
    expect(studentFilesPollIntervalMs(start - 10 * 60_000, { start, end })).toBe(10_000);
    expect(studentFilesPollIntervalMs(end + 10 * 60_000, { start, end })).toBe(10_000);
  });

  it('slows down when the modal is left open long after class', () => {
    expect(studentFilesPollIntervalMs(end + 2 * 60 * 60_000, { start, end })).toBe(90_000);
  });
});

describe('orderSessionFileFolders', () => {
  it('puts the open lesson first and drops duplicates', () => {
    expect(orderSessionFileFolders('a', ['b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('sessionsToScanForFilesTab', () => {
  const now = new Date('2026-09-07T13:00:00.000Z');

  it('defaults to last 30 days plus upcoming, newest first, capped', () => {
    const sessions = [
      { id: 'old', start_time: '2026-07-01T10:00:00.000Z' },
      { id: 'recent', start_time: '2026-09-01T10:00:00.000Z' },
      { id: 'today', start_time: '2026-09-07T11:00:00.000Z' },
      { id: 'soon', start_time: '2026-09-10T11:00:00.000Z' },
    ];
    expect(sessionsToScanForFilesTab(sessions, { now }).map((s) => s.id)).toEqual([
      'soon',
      'today',
      'recent',
    ]);
  });

  it('honours an explicit older date range and still caps folder count', () => {
    const sessions = Array.from({ length: 60 }, (_, i) => ({
      id: `s${i}`,
      start_time: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    }));
    const scanned = sessionsToScanForFilesTab(sessions, {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      now,
    });
    expect(scanned).toHaveLength(SESSION_FILES_TAB_MAX_FOLDERS);
  });
});
