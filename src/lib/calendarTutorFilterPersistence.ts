export type SavedCalendarTutorFilter = {
  selectedTutorIds: string[];
  allTutorsSelected: boolean;
};

const STORAGE_PREFIX = 'tutlio:company-schedule:tutors:v1';

function uniqueNonEmptyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
}

export function calendarTutorFilterStorageKey(
  userId: string | null | undefined,
  organizationId: string | null | undefined,
): string | null {
  const user = String(userId || '').trim();
  const organization = String(organizationId || '').trim();
  if (!user || !organization) return null;
  return `${STORAGE_PREFIX}:${user}:${organization}`;
}

export function readCalendarTutorFilter(
  userId: string | null | undefined,
  organizationId: string | null | undefined,
  storage: Pick<Storage, 'getItem'> | null = typeof window !== 'undefined' ? window.localStorage : null,
): SavedCalendarTutorFilter | null {
  const key = calendarTutorFilterStorageKey(userId, organizationId);
  if (!key || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null') as Record<string, unknown> | null;
    if (!parsed || !Array.isArray(parsed.selectedTutorIds)) return null;
    return {
      selectedTutorIds: uniqueNonEmptyIds(parsed.selectedTutorIds),
      allTutorsSelected: parsed.allTutorsSelected === true,
    };
  } catch {
    return null;
  }
}

export function writeCalendarTutorFilter(
  userId: string | null | undefined,
  organizationId: string | null | undefined,
  value: SavedCalendarTutorFilter,
  storage: Pick<Storage, 'setItem'> | null = typeof window !== 'undefined' ? window.localStorage : null,
): void {
  const key = calendarTutorFilterStorageKey(userId, organizationId);
  if (!key || !storage) return;
  try {
    storage.setItem(key, JSON.stringify({
      selectedTutorIds: uniqueNonEmptyIds(value.selectedTutorIds),
      allTutorsSelected: value.allTutorsSelected === true,
    }));
  } catch {
    // Storage can be unavailable in restricted/private browser contexts.
  }
}

export function selectionContainsEveryTutor(
  selectedTutorIds: Iterable<string>,
  availableTutorIds: Iterable<string>,
): boolean {
  const available = [...new Set(availableTutorIds)];
  if (available.length === 0) return false;
  const selected = new Set(selectedTutorIds);
  return available.every((id) => selected.has(id));
}

export function reconcileCalendarTutorFilter(
  saved: SavedCalendarTutorFilter,
  availableTutorIds: Iterable<string>,
): string[] {
  const available = [...new Set(availableTutorIds)];
  if (saved.allTutorsSelected) return available;
  const availableSet = new Set(available);
  return saved.selectedTutorIds.filter((id) => availableSet.has(id));
}
