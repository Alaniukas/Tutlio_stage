import {
  orgStudentIdentityGroupKey,
  type OrgStudentIdentityRow,
} from './orgStudentIdentity.js';

type SubjectTrialRelation = { is_trial?: boolean | null } | Array<{ is_trial?: boolean | null }> | null;

export type ProKlasePackageStatusRow = {
  student_id?: string | null;
  paid?: boolean | null;
  payment_status?: string | null;
  pool_organization_id?: string | null;
  pool_email_sent_at?: string | null;
  subject?: SubjectTrialRelation;
  subjects?: SubjectTrialRelation;
  lesson_package_items?: Array<{
    subject?: SubjectTrialRelation;
    subjects?: SubjectTrialRelation;
  }> | null;
};

function firstRelation(value: SubjectTrialRelation): { is_trial?: boolean | null } | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * A package clears the post-trial warning only after it was genuinely offered.
 * Cancelled packages never count. Pooled packages are server-created before the
 * email is sent, so their durable delivery timestamp is the source of truth.
 */
export function proKlasePackageCountsAsSent(pkg: ProKlasePackageStatusRow): boolean {
  if (pkg.payment_status === 'cancelled') return false;
  if (pkg.paid === true || pkg.payment_status === 'paid') return true;
  if (pkg.pool_organization_id) return Boolean(pkg.pool_email_sent_at);

  const primary = firstRelation(pkg.subject ?? pkg.subjects ?? null);
  if (primary?.is_trial === false) return true;
  return (pkg.lesson_package_items ?? []).some((item) => {
    const subject = firstRelation(item.subject ?? item.subjects ?? null);
    return subject?.is_trial === false;
  });
}

/** Returns every row id in an identity group that needs a real-package follow-up. */
export function proKlaseTrialFollowupStudentIds(
  students: OrgStudentIdentityRow[],
  completedTrialStudentIds: Iterable<string>,
  packages: ProKlasePackageStatusRow[],
): Set<string> {
  const studentById = new Map(students.map((student) => [student.id, student]));
  const trialIdentityKeys = new Set<string>();
  for (const studentId of completedTrialStudentIds) {
    const student = studentById.get(studentId);
    if (student) trialIdentityKeys.add(orgStudentIdentityGroupKey(student));
  }

  const sentIdentityKeys = new Set<string>();
  for (const pkg of packages) {
    if (!pkg.student_id || !proKlasePackageCountsAsSent(pkg)) continue;
    const student = studentById.get(pkg.student_id);
    if (student) sentIdentityKeys.add(orgStudentIdentityGroupKey(student));
  }

  return new Set(
    students
      .filter((student) => {
        const key = orgStudentIdentityGroupKey(student);
        return trialIdentityKeys.has(key) && !sentIdentityKeys.has(key);
      })
      .map((student) => student.id),
  );
}
