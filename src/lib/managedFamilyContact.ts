export type ManagedFamilyContactError =
  | 'missing_contact'
  | 'missing_parent_name'
  | 'emails_must_differ';

export function validateManagedFamilyContact(input: {
  studentEmail: string;
  parentEmail: string;
  parentName: string;
}): ManagedFamilyContactError | null {
  const studentEmail = input.studentEmail.trim();
  const parentEmail = input.parentEmail.trim();
  const parentName = input.parentName.trim();
  const hasStudentEmail = studentEmail.includes('@');
  const hasParentEmail = parentEmail.includes('@');
  if (!hasStudentEmail && !hasParentEmail) return 'missing_contact';
  if (hasParentEmail && !parentName) return 'missing_parent_name';
  if (
    hasStudentEmail
    && hasParentEmail
    && studentEmail.toLowerCase() === parentEmail.toLowerCase()
  ) {
    return 'emails_must_differ';
  }
  return null;
}

export function managedFamilyPaymentPayer(studentEmail: string, parentEmail: string): 'self' | 'parent' {
  const hasStudentEmail = studentEmail.trim().includes('@');
  const hasParentEmail = parentEmail.trim().includes('@');
  return hasStudentEmail && !hasParentEmail ? 'self' : 'parent';
}

export function managedFamilyProvisionScope(parentEmail: string): 'student' | 'both' {
  return parentEmail.trim().includes('@') ? 'both' : 'student';
}
