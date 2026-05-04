/**
 * Shared overlap rules for tutor calendar session edits (see Calendar handleSaveChanges).
 * Group lessons store one `sessions` row per student with identical start/end — those peers must not count as overlaps.
 */

export type SessionIntervalRow = { id: string; start_time: string; end_time: string };

/** Same calendar slot = same wall-clock start/end (group lesson: one row per student). */
export function buildSameSlotPeerIdMap(rows: SessionIntervalRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!rows.length) return map;

  const slotToIds = new Map<string, string[]>();
  for (const fs of rows) {
    const slotKey = `${new Date(fs.start_time).getTime()}_${new Date(fs.end_time).getTime()}`;
    const arr = slotToIds.get(slotKey) ?? [];
    arr.push(fs.id);
    slotToIds.set(slotKey, arr);
  }

  for (const ids of slotToIds.values()) {
    const idSet = new Set(ids);
    for (const id of ids) {
      map.set(id, idSet);
    }
  }
  return map;
}

/** Mirrors Calendar.tsx overlap predicate (candidate vs existing session interval). */
export function intervalsOverlap(candidateStartMs: number, candidateEndMs: number, otherStartMs: number, otherEndMs: number): boolean {
  return (
    (candidateStartMs >= otherStartMs && candidateStartMs < otherEndMs) ||
    (candidateEndMs > otherStartMs && candidateEndMs <= otherEndMs) ||
    (candidateStartMs <= otherStartMs && candidateEndMs >= otherEndMs)
  );
}

/**
 * True if any row in `overlappingCandidates` intersects [candidateStart, candidateEnd), excluding given ids
 * (e.g. same group slot peers).
 */
export function hasOverlapWithExclusions(
  candidateStart: Date,
  candidateEnd: Date,
  overlappingCandidates: SessionIntervalRow[],
  excludeIds: Set<string>,
): boolean {
  const ns = candidateStart.getTime();
  const ne = candidateEnd.getTime();
  return overlappingCandidates.some((o) => {
    if (excludeIds.has(o.id)) return false;
    const os = new Date(o.start_time).getTime();
    const oe = new Date(o.end_time).getTime();
    return intervalsOverlap(ns, ne, os, oe);
  });
}
