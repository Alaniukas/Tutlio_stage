export type ProKlaseClientRosterFilter = 'all' | 'active' | 'inactive' | 'unassigned' | 'left';

export type ProKlaseClientRosterRow = {
  linked_user_id?: string | null;
  tutor_id?: string | null;
  detached_at?: string | null;
  enrollment_status?: string | null;
  registration_pending?: boolean;
};

export type ProKlaseClientRosterGroup = {
  primary: ProKlaseClientRosterRow;
  rows: ProKlaseClientRosterRow[];
};

export type ProKlaseClientRosterCounts = {
  all: number;
  active: number;
  inactive: number;
  unassigned: number;
  left: number;
};

export function proKlaseClientHasAccount(student: { linked_user_id?: string | null; registration_pending?: boolean }): boolean {
  if (typeof student.registration_pending === 'boolean') return !student.registration_pending;
  return Boolean(student.linked_user_id);
}

export function proKlaseClientHasTutor(rows: Array<{ tutor_id?: string | null }>): boolean {
  return rows.some((row) => Boolean(row.tutor_id));
}

export function proKlaseClientHasLeft(group: ProKlaseClientRosterGroup): boolean {
  return [group.primary, ...group.rows].some((row) => !row.detached_at && row.enrollment_status === 'left');
}

export function matchesProKlaseClientRosterFilter(
  group: ProKlaseClientRosterGroup,
  filter: ProKlaseClientRosterFilter,
): boolean {
  if (group.primary.detached_at) return false;
  if (filter === 'left') return proKlaseClientHasLeft(group);
  if (proKlaseClientHasLeft(group)) return false;
  if (filter === 'all') return true;
  if (filter === 'active') return proKlaseClientHasAccount(group.primary);
  if (filter === 'inactive') return !proKlaseClientHasAccount(group.primary);
  return !proKlaseClientHasTutor(group.rows);
}

export function liveProKlaseClientRosterGroups<T extends ProKlaseClientRosterGroup>(
  groups: T[],
): T[] {
  return groups.filter((group) => !group.primary.detached_at);
}

export function countProKlaseClientRoster(
  groups: ProKlaseClientRosterGroup[],
): ProKlaseClientRosterCounts {
  const live = liveProKlaseClientRosterGroups(groups);
  const current = live.filter((group) => !proKlaseClientHasLeft(group));
  return {
    all: current.length,
    active: current.filter((group) => proKlaseClientHasAccount(group.primary)).length,
    inactive: current.filter((group) => !proKlaseClientHasAccount(group.primary)).length,
    unassigned: current.filter((group) => !proKlaseClientHasTutor(group.rows)).length,
    left: live.filter(proKlaseClientHasLeft).length,
  };
}

export function toggleProKlaseClientRosterFilter(
  current: ProKlaseClientRosterFilter,
  clicked: ProKlaseClientRosterFilter,
): ProKlaseClientRosterFilter {
  if (clicked === 'all') return 'all';
  return current === clicked ? 'all' : clicked;
}
