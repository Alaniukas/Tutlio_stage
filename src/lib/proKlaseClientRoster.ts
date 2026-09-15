export type ProKlaseClientRosterFilter = 'all' | 'active' | 'inactive' | 'unassigned';

export type ProKlaseClientRosterRow = {
  linked_user_id?: string | null;
  tutor_id?: string | null;
  detached_at?: string | null;
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
};

export function proKlaseClientHasAccount(student: { linked_user_id?: string | null }): boolean {
  return Boolean(student.linked_user_id);
}

export function proKlaseClientHasTutor(rows: Array<{ tutor_id?: string | null }>): boolean {
  return rows.some((row) => Boolean(row.tutor_id));
}

export function matchesProKlaseClientRosterFilter(
  group: ProKlaseClientRosterGroup,
  filter: ProKlaseClientRosterFilter,
): boolean {
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
  return {
    all: live.length,
    active: live.filter((group) => proKlaseClientHasAccount(group.primary)).length,
    inactive: live.filter((group) => !proKlaseClientHasAccount(group.primary)).length,
    unassigned: live.filter((group) => !proKlaseClientHasTutor(group.rows)).length,
  };
}

export function toggleProKlaseClientRosterFilter(
  current: ProKlaseClientRosterFilter,
  clicked: ProKlaseClientRosterFilter,
): ProKlaseClientRosterFilter {
  if (clicked === 'all') return 'all';
  return current === clicked ? 'all' : clicked;
}
