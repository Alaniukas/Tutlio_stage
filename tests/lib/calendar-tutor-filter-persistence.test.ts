import { describe, expect, it } from 'vitest';
import {
  calendarTutorFilterStorageKey,
  readCalendarTutorFilter,
  reconcileCalendarTutorFilter,
  selectionContainsEveryTutor,
  writeCalendarTutorFilter,
} from '../../src/lib/calendarTutorFilterPersistence';

function memoryStorage() {
  const rows = new Map<string, string>();
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => void rows.set(key, value),
  };
}

describe('calendar tutor filter persistence', () => {
  it('scopes saved filters to both the signed-in user and organization', () => {
    expect(calendarTutorFilterStorageKey('user-a', 'org-a')).not.toBe(
      calendarTutorFilterStorageKey('user-b', 'org-a'),
    );
    expect(calendarTutorFilterStorageKey('user-a', 'org-a')).not.toBe(
      calendarTutorFilterStorageKey('user-a', 'org-b'),
    );
    expect(calendarTutorFilterStorageKey(null, 'org-a')).toBeNull();
  });

  it('round-trips a partial multi-tutor selection', () => {
    const storage = memoryStorage();
    writeCalendarTutorFilter('user-a', 'org-a', {
      selectedTutorIds: ['tutor-2', 'tutor-1', 'tutor-2'],
      allTutorsSelected: false,
    }, storage);

    expect(readCalendarTutorFilter('user-a', 'org-a', storage)).toEqual({
      selectedTutorIds: ['tutor-2', 'tutor-1'],
      allTutorsSelected: false,
    });
  });

  it('drops tutors that are no longer available without resetting the filter', () => {
    expect(reconcileCalendarTutorFilter({
      selectedTutorIds: ['tutor-1', 'removed-tutor'],
      allTutorsSelected: false,
    }, ['tutor-1', 'tutor-2'])).toEqual(['tutor-1']);
  });

  it('automatically includes a newly added tutor when all tutors were selected', () => {
    expect(reconcileCalendarTutorFilter({
      selectedTutorIds: ['tutor-1'],
      allTutorsSelected: true,
    }, ['tutor-1', 'tutor-2'])).toEqual(['tutor-1', 'tutor-2']);
    expect(selectionContainsEveryTutor(['tutor-2', 'tutor-1'], ['tutor-1', 'tutor-2'])).toBe(true);
  });

  it('ignores malformed storage values', () => {
    const storage = memoryStorage();
    storage.setItem(calendarTutorFilterStorageKey('user-a', 'org-a')!, '{broken');
    expect(readCalendarTutorFilter('user-a', 'org-a', storage)).toBeNull();
  });
});
