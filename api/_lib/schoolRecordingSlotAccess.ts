import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchoolMemberSlot } from '../../src/lib/schoolClassGroups.js';
import { recordingVisibleToMemberSchedules, type RecordingSlotTag } from '../../src/lib/schoolRecordingSlotVisibility.js';

export type RecordingSlotScope = {
  unrestricted: boolean;
  schedules: Array<SchoolMemberSlot[] | null>;
};

export async function recordingSlotScope(
  supabase: SupabaseClient,
  groupId: string,
  studentIds: string[],
  privileged = false,
): Promise<RecordingSlotScope> {
  if (privileged) return { unrestricted: true, schedules: [] };
  if (!studentIds.length) return { unrestricted: false, schedules: [] };
  const { data, error } = await supabase.from('school_class_group_members')
    .select('schedule_slots').eq('group_id', groupId).in('student_id', studentIds);
  if (error) throw error;
  return {
    unrestricted: false,
    schedules: (data || []).map((row) => row.schedule_slots as SchoolMemberSlot[] | null),
  };
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
