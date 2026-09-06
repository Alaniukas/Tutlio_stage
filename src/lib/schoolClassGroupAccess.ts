/** Extra-lessons groups: live lessons / homework / join reminders only after a signed contract. */

export function extraLessonsAccessKey(studentId: string, groupId: string): string {
  return `${studentId}:${groupId}`;
}

/**
 * Membership is enough for ordinary class groups. Groups that have extra-lessons
 * contracts must not notify or list homework until that child has a signed
 * extra-lessons contract for the same group (offer-only membership is not enough).
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
