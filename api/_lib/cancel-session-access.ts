/**
 * Who may cancel a session on behalf of the student (cancelledBy === 'student').
 * Mirrors sessions_student_update RLS: linked student account or linked parent.
 */
export function canStudentSideCancelSession(
    userId: string,
    studentLinkedUserId: string | null | undefined,
    parentUserIdsForStudent: string[]
): boolean {
    if (studentLinkedUserId && studentLinkedUserId === userId) return true;
    return parentUserIdsForStudent.includes(userId);
}

/**
 * Who may cancel as tutor (cancelledBy === 'tutor'): session tutor or org admin of tutor's org.
 */
export function canTutorSideCancelSession(
    userId: string,
    tutorId: string,
    isOrgAdminForTutorOrg: boolean
): boolean {
    if (userId === tutorId) return true;
    return isOrgAdminForTutorOrg;
}
