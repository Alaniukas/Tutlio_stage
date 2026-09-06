/** Extra-lessons groups: live lessons / homework / join reminders only after a signed contract. */

export function extraLessonsAccessKey(studentId: string, groupId: string): string {
  return `${studentId}:${groupId}`;
}

/**
 * Membership is enough for ordinary class groups. If this child already has an
 * extra-lessons offer or contract for the group, live lessons / homework / join
 * reminders wait until that same group is signed (offer-only membership is not enough).
 * Classmates without an extra-lessons contract for the group are unchanged.
 */
export function studentMayUseClassGroup(
  classGroupId: string | null | undefined,
  opts: {
    memberGroupIds: Set<string>;
    extraLessonsGroupIds: Set<string>;
    signedExtraGroupIds: Set<string>;
  },
): boolean {
  if (!classGroupId) return true;
  if (!opts.memberGroupIds.has(classGroupId)) return false;
  if (!opts.extraLessonsGroupIds.has(classGroupId)) return true;
  return opts.signedExtraGroupIds.has(classGroupId);
}
