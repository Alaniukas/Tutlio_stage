import { memberFollowsGroupSlot, type SchoolMemberSlot } from './schoolClassGroups.js';

export type RecordingSlotTag = SchoolMemberSlot | null;

/** An untagged file is hidden from children who attend only part of a group. */
export function recordingVisibleToMemberSchedules(
  memberSchedules: ReadonlyArray<SchoolMemberSlot[] | null>,
  tag: RecordingSlotTag,
): boolean {
  if (memberSchedules.some((schedule) => schedule === null)) return true;
  return tag !== null && memberSchedules.some((schedule) => memberFollowsGroupSlot(schedule, tag));
}
