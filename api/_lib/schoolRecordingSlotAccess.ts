import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchoolMemberSlot } from '../../src/lib/schoolClassGroups.js';
import { recordingVisibleToMemberSchedules, type RecordingSlotTag } from '../../src/lib/schoolRecordingSlotVisibility.js';
import { recordingGrantsForMember, type RecordingPlanContract, type LegacySchoolRecordingScope } from '../../src/lib/schoolRecordingPlan.js';

export type RecordingSlotScope = {
  unrestricted: boolean;
  schedules: Array<SchoolMemberSlot[] | null>;
  allowedStudentIds?: string[];
};

export type RecordingPlanContext = {
  organizationId?: string;
  features?: Record<string, unknown> | null;
};

async function recordingPlanContext(
  supabase: SupabaseClient,
  groupId: string,
  provided: RecordingPlanContext,
): Promise<RecordingPlanContext> {
  if (provided.features !== undefined && provided.organizationId) return provided;
  const { data: group, error } = await supabase.from('school_class_groups')
    .select('organization_id').eq('id', groupId).maybeSingle();
  if (error) throw error;
  if (!group?.organization_id) return {};
  const { data: org, error: orgError } = await supabase.from('organizations')
    .select('id, features').eq('id', group.organization_id).maybeSingle();
  if (orgError) throw orgError;
  return { organizationId: group.organization_id, features: org?.features || {} };
}

export async function recordingSlotScope(
  supabase: SupabaseClient,
  groupId: string,
  studentIds: string[],
  privileged = false,
  providedContext: RecordingPlanContext = {},
): Promise<RecordingSlotScope> {
  if (privileged) return { unrestricted: true, schedules: [] };
  if (!studentIds.length) return { unrestricted: false, schedules: [] };
  const context = await recordingPlanContext(supabase, groupId, providedContext);
  const planEnabled = context.features?.school_family_portal === true;
  const { data, error } = await supabase.from('school_class_group_members')
    .select(planEnabled ? 'student_id, schedule_slots, recording_access, legacy_recording_scope' : 'student_id, schedule_slots')
    .eq('group_id', groupId).in('student_id', studentIds);
  if (error) throw error;
  const members = (data || []) as unknown as Array<{
    student_id: string; schedule_slots: SchoolMemberSlot[] | null; recording_access?: string;
    legacy_recording_scope?: LegacySchoolRecordingScope | null;
  }>;
  let contracts: RecordingPlanContract[] = [];
  if (planEnabled) {
    const result = await supabase.from('school_contracts')
      .select('id, student_id, signing_status, accepted_at, order_snapshot, archived_at, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at, suspension_scope, start_within_14_status')
      .eq('organization_id', context.organizationId!).eq('class_group_id', groupId)
      .eq('kind', 'extra_lessons').eq('signing_status', 'signed').in('student_id', studentIds);
    if (result.error) throw result.error;
    contracts = (result.data || []) as RecordingPlanContract[];
  }
  const schedules: Array<SchoolMemberSlot[] | null> = [];
  const allowedStudentIds: string[] = [];
  for (const member of members) {
    const grants = planEnabled ? recordingGrantsForMember(member.recording_access, member.schedule_slots ?? null,
      contracts.filter((contract) => contract.student_id === member.student_id), new Date(), member.legacy_recording_scope)
      : [{ mode: 'schedule', scheduleSlots: member.schedule_slots ?? null }];
    const visibleGrants = grants.filter((grant) => grant.mode !== 'none'
      && (grant.mode === 'group' || grant.scheduleSlots === null || grant.scheduleSlots.length > 0));
    if (!visibleGrants.length) continue;
    if (member.student_id) allowedStudentIds.push(member.student_id);
    for (const grant of visibleGrants) {
      schedules.push(grant.mode === 'group' ? null : grant.scheduleSlots);
    }
  }
  return {
    unrestricted: false,
    schedules,
    allowedStudentIds,
  };
}

/** Legacy HMAC and logged-in lists use the same child/group entitlement. */
export async function canStudentAccessSchoolGroupRecordings(
  supabase: SupabaseClient,
  groupId: string,
  studentId: string,
  context: RecordingPlanContext = {},
): Promise<boolean> {
  const scope = await recordingSlotScope(supabase, groupId, [studentId], false, context);
  return scope.schedules.length > 0;
}

export async function schoolGroupRecordingStudentIds(
  supabase: SupabaseClient,
  params: { organizationId: string; groupId: string; studentIds: string[]; features: Record<string, unknown> | null },
): Promise<string[]> {
  const scope = await recordingSlotScope(supabase, params.groupId, params.studentIds, false, params);
  return scope.allowedStudentIds || [];
}

export function recordingVisibleToScope(
  scope: { unrestricted: boolean; schedules: ReadonlyArray<SchoolMemberSlot[] | null> },
  tag: RecordingSlotTag,
): boolean {
  return scope.unrestricted || recordingVisibleToMemberSchedules(scope.schedules, tag);
}

export async function recordingSlotTags(
  supabase: SupabaseClient,
  groupId: string,
): Promise<Map<string, SchoolMemberSlot>> {
  const { data, error } = await supabase.from('school_recording_file_slots')
    .select('drive_file_id, weekday, start_time').eq('group_id', groupId);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.drive_file_id, {
    weekday: Number(row.weekday), start_time: String(row.start_time).slice(0, 5),
  }]));
}

export async function recordingSlotTag(
  supabase: SupabaseClient,
  groupId: string,
  fileId: string,
): Promise<SchoolMemberSlot | null> {
  const { data, error } = await supabase.from('school_recording_file_slots')
    .select('weekday, start_time').eq('group_id', groupId).eq('drive_file_id', fileId).maybeSingle();
  if (error) throw error;
  return data ? { weekday: Number(data.weekday), start_time: String(data.start_time).slice(0, 5) } : null;
}
