// Auth identifiers are separate from contact emails. This reserved domain cannot receive mail.
const STUDENT_LOGIN_DOMAIN = 'student-login.tutlio.invalid';

export function isStudentLoginName(value: string): boolean {
  return /^mv-[a-f0-9]{16}$/.test(value.trim().toLowerCase());
}

export function loginIdentifierToEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  return isStudentLoginName(normalized)
    ? `${normalized}@${STUDENT_LOGIN_DOMAIN}`
    : value.trim();
}

export function studentLoginNameFromEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const suffix = `@${STUDENT_LOGIN_DOMAIN}`;
  const loginName = normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : '';
  return isStudentLoginName(loginName) ? loginName : null;
}
