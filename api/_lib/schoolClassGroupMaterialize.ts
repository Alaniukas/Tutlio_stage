/**
 * School class groups → `sessions` rows.
 *
 * One group = weekly slots (Vilnius wall clock) × enrolled members. Rows are
 * materialized inside a rolling window and RECONCILED against the group's
 * current definition, so editing a slot (18:00 → 19:00), removing a member or
 * changing the teacher moves the future lessons instead of stacking a second
 * copy next to the old one. Rows that already started, were joined, cancelled
 * or completed are history and are never touched.
 *
 * Used by the hourly materializer cron and synchronously by
 * `/api/school-class-groups` on create / update / delete, so a saved group is
 * visible in every calendar immediately (previously only after the next cron).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRollingOccurrenceDates, wallClockToUtc } from './recurringOccurrences.js';
import {
  EXTRA_LESSONS_CONTRACT_KIND,
  extraLessonsServiceStartYmd,
  type ExtraLessonsOrderSnapshot,
  type StartWithin14Status,
} from '../../src/lib/extraLessonsContract.js';
import { snapshotFromRow } from './extraLessonsContractShared.js';
import { isSchoolContractSuspended } from '../../src/lib/schoolContractLifecycle.js';
import { isSchoolClassGroupSuspended, isEligibleAcceptedSchoolGroupContract } from '../../src/lib/schoolGroupMinimumPolicy.js';
import { memberFollowsGroupSlot, type SchoolMemberSlot } from '../../src/lib/schoolClassGroups.js';
import { isSessionOccurrenceExcluded, loadSessionRecurrenceExclusions } from './sessionRecurrenceExclusions.js';
import { restoreExpiredSchoolGroupMemberships } from './schoolGroupMembership.js';

export const CLASS_GROUP_HORIZON_DAYS = 60;
const INSERT_CHUNK = 400;

export const CLASS_GROUP_MATERIALIZE_SELECT =
  'id, organization_id, tutor_id, subject_id, meeting_link, duration_minutes, school_year_start, school_year_end, suspension_started_at, suspension_until, suspension_resumed_at, '
  + 'slots:school_class_group_slots(weekday, start_time, end_time), members:school_class_group_members(student_id, schedule_slots)';

export type MaterializeGroupSlot = { weekday: number | string; start_time: string; end_time: string };

export type MaterializeGroupRow = {
  id: string;
  organization_id?: string | null;
  tutor_id: string;
  subject_id?: string | null;
  meeting_link?: string | null;
  duration_minutes?: number | null;
  school_year_start: string;
  school_year_end: string;
  suspension_started_at?: string | null;
  suspension_until?: string | null;
  suspension_resumed_at?: string | null;
  slots?: MaterializeGroupSlot[] | null;
  members?: Array<{ student_id: string; schedule_slots?: SchoolMemberSlot[] | null }> | null;
};

export type ClassGroupOccurrence = {
  ymd: string;
  startIso: string;
  endIso: string;
  slot: SchoolMemberSlot;
  originalStartIso?: string;
  meetingLink?: string | null;
  rescheduledAt?: string;
};

export type ClassGroupOccurrenceOverride = {
  original_start_time: string; start_time: string; end_time: string;
  meeting_link: string | null; updated_at: string;
};

export type MaterializeWindow = {
  now: Date;
  nowIso: string;
  windowStartYmd: string;
  windowEndYmd: string;
};

/** `${studentId}:${groupId}` → first service day (extra-lessons 14-day gate). */
export type ExtraStartGateMap = Map<string, string> & {
  endYmdByKey?: Map<string, string>;
  /** Accepted extra-lessons unit price (€ / session) for this student and group. */
  priceByKey?: Map<string, number>;
};

export type ReconcileResult = {
  groupId: string;
  created: number;
  deleted: number;
  updated: number;
  adopted: number;
  skipped: number;
};

export function ymdInVilnius(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function materializationWindow(now: Date = new Date(), horizonDays = CLASS_GROUP_HORIZON_DAYS): MaterializeWindow {
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  return {
    now,
    nowIso: now.toISOString(),
    windowStartYmd: ymdInVilnius(now),
    windowEndYmd: ymdInVilnius(horizon),
  };
}

function hhmm(value: string | null | undefined, fallback: string): string {
  const v = String(value || '').slice(0, 5);
  return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
}

function addMinutesHhmm(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = (((h || 0) * 60 + (m || 0) + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** First calendar day on/after `school_year_start` that falls on `weekday` (0 = Sunday). */
function alignedSlotStart(schoolYearStart: string, weekday: number): string {
  const anchor = new Date(`${String(schoolYearStart).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return String(schoolYearStart).slice(0, 10);
  const want = ((weekday % 7) + 7) % 7;
  let guard = 0;
  while (anchor.getUTCDay() !== want && guard < 8) {
    anchor.setUTCDate(anchor.getUTCDate() + 1);
    guard += 1;
  }
  return anchor.toISOString().slice(0, 10);
}

/**
 * Pure: every lesson window the group definition expects inside
 * [windowStartYmd, windowEndYmd] whose end is still in the future.
 */
export function expectedClassGroupOccurrences(
  group: MaterializeGroupRow,
  window: MaterializeWindow,
  overrides: ClassGroupOccurrenceOverride[] = [],
): ClassGroupOccurrence[] {
  const out: ClassGroupOccurrence[] = [];
  const seen = new Set<string>();
  const duration = Math.max(15, Number(group.duration_minutes) || 45);
  const nowMs = window.now.getTime();
  const movedOriginals = new Set(overrides.map(row => isoKey(row.original_start_time)));
  for (const slot of group.slots || []) {
    const weekday = Number(slot.weekday);
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
    const startTime = hhmm(slot.start_time, '');
    if (!startTime) continue;
    const endTime = hhmm(slot.end_time, addMinutesHhmm(startTime, duration));
    const dates = buildRollingOccurrenceDates(
      {
        start_date: alignedSlotStart(group.school_year_start, weekday),
        end_date: String(group.school_year_end || '').slice(0, 10) || null,
        start_time: startTime,
        end_time: endTime,
        frequency: 'weekly',
      },
      window.windowStartYmd,
      window.windowEndYmd,
    );
    for (const ymd of dates) {
      const startUtc = wallClockToUtc(ymd, startTime);
      let endUtc = wallClockToUtc(ymd, endTime);
      if (endUtc.getTime() <= startUtc.getTime()) {
        endUtc = new Date(startUtc.getTime() + duration * 60_000);
      }
      if (endUtc.getTime() <= nowMs) continue; // already over — history, not ours
      const startIso = startUtc.toISOString();
      if (movedOriginals.has(startIso)) continue;
      if (seen.has(startIso)) continue; // two slots on the same weekday/time
      seen.add(startIso);
      out.push({ ymd, startIso, endIso: endUtc.toISOString(), slot: { weekday, start_time: startTime } });
    }
  }
  for (const override of overrides) {
    const start = new Date(override.start_time);
    const end = new Date(override.end_time);
    const original = new Date(override.original_start_time);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || !Number.isFinite(original.getTime())
      || end.getTime() <= nowMs || end <= start) continue;
    const ymd = ymdInVilnius(start);
    // An explicit move can be farther away than the regular rolling horizon.
    if (ymd < window.windowStartYmd) continue;
    const originalYmd = ymdInVilnius(original);
    const weekday = new Date(`${originalYmd}T12:00:00Z`).getUTCDay();
    const startTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(original);
    out.push({ ymd, startIso: start.toISOString(), endIso: end.toISOString(), originalStartIso: original.toISOString(),
      slot: { weekday, start_time: startTime }, meetingLink: override.meeting_link, rescheduledAt: override.updated_at });
  }
  return out.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

export async function loadExtraLessonsStartGates(
  supabase: SupabaseClient,
  organizationId?: string | null,
): Promise<ExtraStartGateMap> {
  await restoreExpiredSchoolGroupMemberships(supabase, organizationId);
  const gates: ExtraStartGateMap = new Map();
  gates.endYmdByKey = new Map();
  gates.priceByKey = new Map();
  const priceAcceptedAt = new Map<string, string>();
  let query = supabase
    .from('school_contracts')
    .select('student_id, class_group_id, accepted_at, signing_status, archived_at, terminated_at, unit_price_eur, start_within_14_status, start_within_14_days, order_snapshot, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at')
    .eq('kind', EXTRA_LESSONS_CONTRACT_KIND);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  for (const row of (data || []) as any[]) {
    const order = snapshotFromRow(row) as ExtraLessonsOrderSnapshot | null;
    const groupId = row.class_group_id || order?.group_id;
    if (!row.student_id || !groupId) continue;
    const key = `${row.student_id}:${groupId}`;
    // An explicit ended/unsigned group agreement blocks this child, rather
    // than disappearing and letting the roster regenerate their lessons.
    if (!gates.has(key)) gates.set(key, '9999-12-31');
    if (!order || !isEligibleAcceptedSchoolGroupContract(row) || isSchoolContractSuspended(row)) continue;
    const ymd = extraLessonsServiceStartYmd({
      status: (row.start_within_14_status || (row.start_within_14_days ? 'yes' : 'no')) as StartWithin14Status,
      acceptedAtIso: row.accepted_at,
      order,
    });
    // Several revisions may cover one child/group; an eligible agreement
    // wins over ended revisions regardless of database row order.
    if (ymd < gates.get(key)!) gates.set(key, ymd);
    const endDate = order.end_date || '9999-12-31';
    if (endDate > (gates.endYmdByKey.get(key) || '')) gates.endYmdByKey.set(key, endDate);
    const unit = Math.round(Number(row.unit_price_eur || order.unit_price_eur || 0) * 100) / 100;
    const acceptedAt = String(row.accepted_at || '');
    if (unit > 0 && acceptedAt >= (priceAcceptedAt.get(key) || '')) {
      priceAcceptedAt.set(key, acceptedAt);
      gates.priceByKey.set(key, unit);
    }
  }
  return gates;
}

function contractSessionPrice(
  gates: ExtraStartGateMap | undefined,
  studentId: string,
  groupId: string,
): number {
  const price = gates?.priceByKey?.get(`${studentId}:${groupId}`);
  return price && price > 0 ? price : 0;
}

type ExistingRow = {
  id: string;
  student_id: string;
  tutor_id: string | null;
  subject_id: string | null;
  meeting_link: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
  class_group_id: string | null;
  student_joined_at: string | null;
  tutor_joined_at: string | null;
  price?: number | null;
};

function isoKey(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(value);
}

function rowKey(studentId: string, startIso: string): string {
  return `${studentId}|${startIso}`;
}

/** Generated, not yet started, nobody joined — safe to move/remove with the group. */
export function isReplaceableGeneratedRow(row: ExistingRow, nowMs: number): boolean {
  if (row.status !== 'active') return false;
  if (row.student_joined_at || row.tutor_joined_at) return false;
  const startMs = Date.parse(row.start_time);
  return Number.isFinite(startMs) && startMs > nowMs;
}

/**
 * Bring the `sessions` table in line with one group inside the window.
 * Idempotent: running it twice creates nothing the second time.
 */
export async function reconcileClassGroupSessions(
  supabase: SupabaseClient,
  group: MaterializeGroupRow,
  options: {
    window?: MaterializeWindow;
    extraGates?: ExtraStartGateMap;
    /** Pre-resolved archived students (skips a query when the caller already knows). */
    detachedStudentIds?: Set<string>;
  } = {},
): Promise<ReconcileResult> {
  const window = options.window ?? materializationWindow();
  const result: ReconcileResult = { groupId: group.id, created: 0, deleted: 0, updated: 0, adopted: 0, skipped: 0 };
  const memberIds = [...new Set((group.members || []).map((m) => m.student_id).filter(Boolean))];

  let detached = options.detachedStudentIds;
  if (!detached && memberIds.length) {
    const { data: studentRows } = await supabase
      .from('students')
      .select('id, detached_at')
      .in('id', memberIds);
    detached = new Set(
      ((studentRows || []) as Array<{ id: string; detached_at: string | null }>)
        .filter((s) => s.detached_at != null)
        .map((s) => s.id),
    );
  }
  const activeMembers = isSchoolClassGroupSuspended(group, window.now)
    ? []
    : (group.members || []).filter((member) => member.student_id && !detached?.has(member.student_id));

  const overrides = await supabase.from('school_class_group_occurrence_overrides')
    .select('original_start_time,start_time,end_time,meeting_link,updated_at').eq('group_id', group.id);
  // Fail closed: generating against an unknown exception set can erase a move.
  if (overrides.error) throw new Error(`[class-groups] load occurrence overrides failed: ${overrides.error.message}`);
  const occurrences = expectedClassGroupOccurrences(group, window, overrides.data || []);
  const exclusions = await loadSessionRecurrenceExclusions(supabase, { classGroupId: group.id });
  const expected = new Map<string, ClassGroupOccurrence & { student_id: string }>();
  for (const occ of occurrences) {
    for (const member of activeMembers) {
      if (!memberFollowsGroupSlot(member.schedule_slots, occ.slot)) continue;
      const studentId = member.student_id;
      if (isSessionOccurrenceExcluded(exclusions, studentId, occ.startIso)
        || (occ.originalStartIso && isSessionOccurrenceExcluded(exclusions, studentId, occ.originalStartIso))) {
        result.skipped += 1;
        continue;
      }
      const contractKey = `${studentId}:${group.id}`;
      const gate = options.extraGates?.get(contractKey);
      const endDate = options.extraGates?.endYmdByKey?.get(contractKey);
      if ((gate && occ.ymd < gate) || (endDate && occ.ymd > endDate)) {
        result.skipped += 1;
        continue;
      }
      expected.set(rowKey(studentId, occ.startIso), { ...occ, student_id: studentId });
    }
  }

  // 1) Rows already attached to this group (future part only).
  const { data: attachedRows, error: attachedErr } = await supabase
    .from('sessions')
    .select('id, student_id, tutor_id, subject_id, meeting_link, start_time, end_time, status, class_group_id, price, student_joined_at, tutor_joined_at')
    .eq('class_group_id', group.id)
    .gt('end_time', window.nowIso);
  if (attachedErr) throw new Error(`[class-groups] load sessions failed: ${attachedErr.message}`);

  const nowMs = window.now.getTime();
  const seen = new Set<string>();
  const toDelete: ExistingRow[] = [];
  const toUpdate: Array<{ id: string; patch: Record<string, unknown>; snapshot: ExistingRow }> = [];

  for (const row of (attachedRows || []) as ExistingRow[]) {
    const key = rowKey(row.student_id, isoKey(row.start_time));
    const want = expected.get(key);
    if (want && !seen.has(key)) {
      seen.add(key);
      if (row.status === 'active') {
        const patch: Record<string, unknown> = {};
        if (row.tutor_id !== group.tutor_id) patch.tutor_id = group.tutor_id;
        if (isoKey(row.end_time) !== want.endIso) patch.end_time = want.endIso;
        const meetingLink = want.originalStartIso ? want.meetingLink : group.meeting_link;
        if ((row.meeting_link || null) !== (meetingLink || null)) patch.meeting_link = meetingLink || null;
        if ((row.subject_id || null) !== (group.subject_id || null)) patch.subject_id = group.subject_id || null;
        const contractPrice = contractSessionPrice(options.extraGates, row.student_id, group.id);
        if (contractPrice > 0 && !(Number(row.price) > 0)) patch.price = contractPrice;
        if (Object.keys(patch).length) toUpdate.push({ id: row.id, patch, snapshot: row });
      }
      continue;
    }
    // Duplicate of a kept row, a slot that moved, or a removed member.
    if (isReplaceableGeneratedRow(row, nowMs)) toDelete.push(row);
  }

  // 2) Same student + same start already booked with this teacher outside the
  //    group (orphan from an earlier delete, or a manual lesson): adopt, never duplicate.
  const missing = [...expected.entries()].filter(([key]) => !seen.has(key));
  const toInsert: Array<Record<string, unknown>> = [];
  if (missing.length) {
    const startIsos = [...new Set(missing.map(([, v]) => v.startIso))];
    const { data: foreignRows } = await supabase
      .from('sessions')
      .select('id, student_id, tutor_id, subject_id, meeting_link, start_time, end_time, status, class_group_id, price, student_joined_at, tutor_joined_at')
      .eq('tutor_id', group.tutor_id)
      .in('student_id', activeMembers.length ? activeMembers.map((member) => member.student_id) : ['00000000-0000-0000-0000-000000000000'])
      .in('start_time', startIsos)
      .neq('status', 'cancelled');
    const foreign = new Map<string, ExistingRow>();
    for (const row of (foreignRows || []) as ExistingRow[]) {
      const key = rowKey(row.student_id, isoKey(row.start_time));
      if (!foreign.has(key)) foreign.set(key, row);
    }
    for (const [key, want] of missing) {
      const existing = foreign.get(key);
      if (existing) {
        if (!existing.class_group_id) {
          const contractPrice = contractSessionPrice(options.extraGates, want.student_id, group.id);
          const patch: Record<string, unknown> = { class_group_id: group.id };
          if (contractPrice > 0 && !(Number(existing.price) > 0)) patch.price = contractPrice;
          toUpdate.push({ id: existing.id, patch, snapshot: existing });
          result.adopted += 1;
        }
        continue;
      }
      toInsert.push({
        tutor_id: group.tutor_id,
        student_id: want.student_id,
        subject_id: group.subject_id || null,
        start_time: want.startIso,
        end_time: want.endIso,
        created_by_role: 'system',
        status: 'active',
        meeting_link: (want.originalStartIso ? want.meetingLink : group.meeting_link) || null,
        price: contractSessionPrice(options.extraGates, want.student_id, group.id),
        school_billing_kind: 'base',
        class_group_id: group.id,
        ...(want.originalStartIso ? { original_start_time: want.originalStartIso, rescheduled_at: want.rescheduledAt } : {}),
      });
    }
  }

  if (toDelete.length || toUpdate.length || toInsert.length) {
    const current = await supabase.from('school_class_group_occurrence_overrides')
      .select('original_start_time,start_time,end_time,meeting_link,updated_at').eq('group_id', group.id);
    if (current.error) throw new Error(`[class-groups] recheck occurrence overrides failed: ${current.error.message}`);
    const version = (rows: ClassGroupOccurrenceOverride[]) => JSON.stringify(rows.map(row =>
      [isoKey(row.original_start_time), isoKey(row.start_time), isoKey(row.end_time), row.meeting_link, row.updated_at]).sort());
    if (version(current.data || []) !== version(overrides.data || [])) {
      throw new Error('[class-groups] occurrence moved during reconciliation; retry with the current schedule');
    }
  }
  const deletesByTime = new Map<string, ExistingRow[]>();
  for (const row of toDelete) {
    const key = `${row.start_time}/${row.end_time}`;
    deletesByTime.set(key, [...(deletesByTime.get(key) || []), row]);
  }
  for (const rows of deletesByTime.values()) {
    const { data, error } = await supabase.from('sessions').delete().in('id', rows.map(row => row.id))
      .eq('start_time', rows[0].start_time).eq('end_time', rows[0].end_time).eq('status', 'active')
      .is('student_joined_at', null).is('tutor_joined_at', null).select('id');
    if (error) throw new Error(`[class-groups] delete stale sessions failed: ${error.message}`);
    result.deleted += data?.length ?? rows.length;
  }
  for (const item of toUpdate) {
    const snapshot = item.snapshot;
    let query = supabase.from('sessions').update(item.patch).eq('id', item.id)
      .eq('start_time', snapshot.start_time).eq('end_time', snapshot.end_time).eq('status', snapshot.status!);
    query = snapshot.meeting_link ? query.eq('meeting_link', snapshot.meeting_link) : query.is('meeting_link', null);
    const { data, error } = await query.select('id');
    if (error) {
      console.error('[class-groups] session update failed', item.id, error.message);
      continue;
    }
    result.updated += data?.length ?? 1;
  }
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('sessions').insert(chunk);
    if (error) throw new Error(`[class-groups] insert sessions failed: ${error.message}`);
    result.created += chunk.length;
  }

  // Older group lessons were stored with price 0. Copy the contract unit price
  // onto those rows, including ones that already happened, without replacing a
  // price that was set on purpose.
  const studentsByPrice = new Map<number, string[]>();
  for (const member of group.members || []) {
    if (!member.student_id) continue;
    const price = contractSessionPrice(options.extraGates, member.student_id, group.id);
    if (!(price > 0)) continue;
    const ids = studentsByPrice.get(price) || [];
    ids.push(member.student_id);
    studentsByPrice.set(price, ids);
  }
  for (const [price, studentIds] of studentsByPrice) {
    const { error } = await supabase.from('sessions').update({ price })
      .eq('class_group_id', group.id)
      .in('student_id', studentIds)
      .eq('price', 0);
    if (error) console.error('[class-groups] contract price backfill failed', group.id, error.message);
  }
  return result;
}

/** Group row with slots/members in the shape `reconcileClassGroupSessions` needs. */
export async function loadClassGroupForMaterialize(
  supabase: SupabaseClient,
  groupId: string,
): Promise<MaterializeGroupRow | null> {
  const { data, error } = await supabase
    .from('school_class_groups')
    .select(CLASS_GROUP_MATERIALIZE_SELECT)
    .eq('id', groupId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as MaterializeGroupRow;
}

/** Sync one group right after it was created or edited (safe to call often). */
export async function materializeClassGroupNow(
  supabase: SupabaseClient,
  groupId: string,
  organizationId?: string | null,
): Promise<ReconcileResult | null> {
  const initialGroup = await loadClassGroupForMaterialize(supabase, groupId);
  if (!initialGroup || !initialGroup.organization_id
    || (organizationId && initialGroup.organization_id !== organizationId)) return null;
  const extraGates = await loadExtraLessonsStartGates(supabase, initialGroup.organization_id);
  // Expired individual pauses may have restored members while loading gates.
  const group = await loadClassGroupForMaterialize(supabase, groupId);
  if (!group) return null;
  return reconcileClassGroupSessions(supabase, group, { extraGates });
}

/**
 * Before a group row is deleted (FK sets `sessions.class_group_id` to NULL):
 * remove the generated future lessons so they do not linger as orphans.
 */
export async function removeFutureClassGroupSessions(
  supabase: SupabaseClient,
  groupId: string,
  now: Date = new Date(),
): Promise<number> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, student_id, tutor_id, subject_id, meeting_link, start_time, end_time, status, class_group_id, student_joined_at, tutor_joined_at')
    .eq('class_group_id', groupId)
    .gt('start_time', now.toISOString());
  if (error) throw new Error(`[class-groups] load sessions for delete failed: ${error.message}`);
  const ids = ((data || []) as ExistingRow[])
    .filter((row) => isReplaceableGeneratedRow(row, now.getTime()))
    .map((row) => row.id);
  if (!ids.length) return 0;
  const { error: delErr } = await supabase.from('sessions').delete().in('id', ids);
  if (delErr) throw new Error(`[class-groups] delete sessions failed: ${delErr.message}`);
  return ids.length;
}

/** All groups of one organization that overlap the window, ready for reconciliation. */
export async function loadClassGroupsForOrg(
  supabase: SupabaseClient,
  organizationId: string,
  window: MaterializeWindow,
): Promise<MaterializeGroupRow[]> {
  const { data } = await supabase
    .from('school_class_groups')
    .select(CLASS_GROUP_MATERIALIZE_SELECT)
    .eq('organization_id', organizationId)
    .lte('school_year_start', window.windowEndYmd)
    .gte('school_year_end', window.windowStartYmd);
  return ((data || []) as unknown as MaterializeGroupRow[]);
}
