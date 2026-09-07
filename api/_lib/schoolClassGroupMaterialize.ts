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

export const CLASS_GROUP_HORIZON_DAYS = 60;
const INSERT_CHUNK = 400;

export const CLASS_GROUP_MATERIALIZE_SELECT =
  'id, organization_id, tutor_id, subject_id, meeting_link, duration_minutes, school_year_start, school_year_end, '
  + 'slots:school_class_group_slots(weekday, start_time, end_time), members:school_class_group_members(student_id)';

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
  slots?: MaterializeGroupSlot[] | null;
  members?: Array<{ student_id: string }> | null;
};

export type ClassGroupOccurrence = {
  ymd: string;
  startIso: string;
  endIso: string;
};

export type MaterializeWindow = {
  now: Date;
  nowIso: string;
  windowStartYmd: string;
  windowEndYmd: string;
};

/** `${studentId}:${groupId}` → first service day (extra-lessons 14-day gate). */
export type ExtraStartGateMap = Map<string, string>;

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
): ClassGroupOccurrence[] {
  const out: ClassGroupOccurrence[] = [];
  const seen = new Set<string>();
  const duration = Math.max(15, Number(group.duration_minutes) || 45);
  const nowMs = window.now.getTime();
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
      if (seen.has(startIso)) continue; // two slots on the same weekday/time
      seen.add(startIso);
      out.push({ ymd, startIso, endIso: endUtc.toISOString() });
    }
  }
  return out.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

export async function loadExtraLessonsStartGates(
  supabase: SupabaseClient,
  organizationId?: string | null,
): Promise<ExtraStartGateMap> {
  const gates: ExtraStartGateMap = new Map();
  let query = supabase
    .from('school_contracts')
    .select('student_id, class_group_id, accepted_at, start_within_14_status, start_within_14_days, order_snapshot, withdrawal_requested_at')
    .eq('kind', EXTRA_LESSONS_CONTRACT_KIND)
    .eq('signing_status', 'signed')
    .not('accepted_at', 'is', null);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data } = await query;
  for (const row of (data || []) as any[]) {
    if (row.withdrawal_requested_at) continue;
    const order = snapshotFromRow(row) as ExtraLessonsOrderSnapshot | null;
    if (!order || !row.accepted_at || !row.student_id) continue;
    const ymd = extraLessonsServiceStartYmd({
      status: (row.start_within_14_status || (row.start_within_14_days ? 'yes' : 'no')) as StartWithin14Status,
      acceptedAtIso: row.accepted_at,
      order,
    });
    gates.set(`${row.student_id}:${row.class_group_id || order.group_id || ''}`, ymd);
  }
  return gates;
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
  const activeMembers = memberIds.filter((id) => !detached?.has(id));

  const occurrences = expectedClassGroupOccurrences(group, window);
  const expected = new Map<string, { student_id: string; startIso: string; endIso: string }>();
  for (const occ of occurrences) {
    for (const studentId of activeMembers) {
      const gate = options.extraGates?.get(`${studentId}:${group.id}`);
      if (gate && occ.ymd < gate) {
        result.skipped += 1;
        continue;
      }
      expected.set(rowKey(studentId, occ.startIso), { student_id: studentId, startIso: occ.startIso, endIso: occ.endIso });
    }
  }

  // 1) Rows already attached to this group (future part only).
  const { data: attachedRows, error: attachedErr } = await supabase
    .from('sessions')
    .select('id, student_id, tutor_id, subject_id, meeting_link, start_time, end_time, status, class_group_id, student_joined_at, tutor_joined_at')
    .eq('class_group_id', group.id)
    .gt('end_time', window.nowIso);
  if (attachedErr) throw new Error(`[class-groups] load sessions failed: ${attachedErr.message}`);

  const nowMs = window.now.getTime();
  const seen = new Set<string>();
  const toDelete: string[] = [];
  const toUpdate: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const row of (attachedRows || []) as ExistingRow[]) {
    const key = rowKey(row.student_id, isoKey(row.start_time));
    const want = expected.get(key);
    if (want && !seen.has(key)) {
      seen.add(key);
      if (row.status === 'active') {
        const patch: Record<string, unknown> = {};
        if (row.tutor_id !== group.tutor_id) patch.tutor_id = group.tutor_id;
        if (isoKey(row.end_time) !== want.endIso) patch.end_time = want.endIso;
        if ((row.meeting_link || null) !== (group.meeting_link || null)) patch.meeting_link = group.meeting_link || null;
        if ((row.subject_id || null) !== (group.subject_id || null)) patch.subject_id = group.subject_id || null;
        if (Object.keys(patch).length) toUpdate.push({ id: row.id, patch });
      }
      continue;
    }
    // Duplicate of a kept row, a slot that moved, or a removed member.
    if (isReplaceableGeneratedRow(row, nowMs)) toDelete.push(row.id);
  }

  // 2) Same student + same start already booked with this teacher outside the
  //    group (orphan from an earlier delete, or a manual lesson): adopt, never duplicate.
  const missing = [...expected.entries()].filter(([key]) => !seen.has(key));
  const toInsert: Array<Record<string, unknown>> = [];
  if (missing.length) {
    const startIsos = [...new Set(missing.map(([, v]) => v.startIso))];
    const { data: foreignRows } = await supabase
      .from('sessions')
      .select('id, student_id, tutor_id, subject_id, meeting_link, start_time, end_time, status, class_group_id, student_joined_at, tutor_joined_at')
      .eq('tutor_id', group.tutor_id)
      .in('student_id', activeMembers.length ? activeMembers : ['00000000-0000-0000-0000-000000000000'])
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
          toUpdate.push({ id: existing.id, patch: { class_group_id: group.id } });
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
        status: 'active',
        meeting_link: group.meeting_link || null,
        price: 0,
        school_billing_kind: 'base',
        class_group_id: group.id,
      });
    }
  }

  if (toDelete.length) {
    const { error } = await supabase.from('sessions').delete().in('id', toDelete);
    if (error) throw new Error(`[class-groups] delete stale sessions failed: ${error.message}`);
    result.deleted = toDelete.length;
  }
  for (const item of toUpdate) {
    const { error } = await supabase.from('sessions').update(item.patch).eq('id', item.id);
    if (error) {
      console.error('[class-groups] session update failed', item.id, error.message);
      continue;
    }
    result.updated += 1;
  }
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('sessions').insert(chunk);
    if (error) throw new Error(`[class-groups] insert sessions failed: ${error.message}`);
    result.created += chunk.length;
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
  const group = await loadClassGroupForMaterialize(supabase, groupId);
  if (!group) return null;
  const extraGates = await loadExtraLessonsStartGates(supabase, organizationId ?? group.organization_id ?? null);
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
