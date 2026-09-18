// Auth identifiers are separate from contact emails. This reserved domain cannot receive mail.
const STUDENT_LOGIN_DOMAIN = 'student-login.tutlio.invalid';

// Keep accepting the original 16-character hex handles already issued in production.
// New handles are shorter and omit characters that are easy to misread (i/l/o/0/1).
const LEGACY_STUDENT_LOGIN_NAME = /^mv-[a-f0-9]{16}$/;
const READABLE_STUDENT_LOGIN_NAME = /^(?:mv|pk|st)-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/;

export function isStudentLoginName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return LEGACY_STUDENT_LOGIN_NAME.test(normalized)
    || READABLE_STUDENT_LOGIN_NAME.test(normalized);
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
