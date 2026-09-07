/**
 * Which school terminology the current portal renders with. Portal layouts
 * register an owner (school admin, school teacher, parent / student of a school
 * org); `t()` reads the union of all registered owners so a nested layout
 * unmounting never switches the wording off under the outer one.
 *
 * The value updates synchronously, but subscribers are notified in a microtask
 * and only when the net mode really changed. Some pages define their layout
 * component inline (it remounts on every render); the unregister + register
 * pair of such a remount therefore never triggers a re-render, which would
 * otherwise loop ("Maximum update depth exceeded").
 */
import { NO_SCHOOL_TERMINOLOGY, type SchoolTerminology } from './schoolTerminology.js';

const owners = new Map<symbol, SchoolTerminology>();
let current: SchoolTerminology = NO_SCHOOL_TERMINOLOGY;
let notified: SchoolTerminology = NO_SCHOOL_TERMINOLOGY;
let version = 0;
let flushScheduled = false;
const listeners = new Set<() => void>();

function sameMode(a: SchoolTerminology, b: SchoolTerminology): boolean {
  return a.staff === b.staff && a.activity === b.activity;
}

function flush(): void {
  flushScheduled = false;
  if (sameMode(current, notified)) return;
  notified = current;
  version += 1;
  for (const listener of listeners) listener();
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  if (typeof queueMicrotask === 'function') queueMicrotask(flush);
  else void Promise.resolve().then(flush);
}

function recompute(): void {
  let staff = false;
  let activity = false;
  for (const mode of owners.values()) {
    staff = staff || mode.staff;
    activity = activity || mode.activity;
  }
  if (!sameMode(current, { staff, activity })) current = { staff, activity };
  scheduleFlush();
}

export function registerSchoolTerminologyOwner(owner: symbol, mode: SchoolTerminology): void {
  const existing = owners.get(owner);
  if (existing && sameMode(existing, mode)) return;
  owners.set(owner, { staff: !!mode.staff, activity: !!mode.activity });
  recompute();
}

export function unregisterSchoolTerminologyOwner(owner: symbol): void {
  if (!owners.delete(owner)) return;
  recompute();
}

/** Effective mode right now (what `t()` uses). */
export function getSchoolTerminology(): SchoolTerminology {
  return current;
}

/** Bumps only when subscribers were told about a real change. */
export function getSchoolTerminologyVersion(): number {
  return version;
}

export function subscribeSchoolTerminology(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Deliver pending notifications now (tests). */
export function flushSchoolTerminology(): void {
  flush();
}

/** Tests / logout: drop every owner. */
export function resetSchoolTerminology(): void {
  owners.clear();
  recompute();
  flush();
}
