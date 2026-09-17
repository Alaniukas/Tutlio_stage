import { randomInt } from 'node:crypto';

// Lowercase, URL-safe and without i/l/o/0/1 so a child can copy it reliably.
const STUDENT_LOGIN_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export type StudentLoginPrefix = 'mv' | 'pk';

export function generateStudentLoginName(prefix: StudentLoginPrefix = 'mv'): string {
  let value = '';
  for (let index = 0; index < 8; index += 1) {
    value += STUDENT_LOGIN_CHARS[randomInt(STUDENT_LOGIN_CHARS.length)];
  }
  return `${prefix}-${value.slice(0, 4)}-${value.slice(4)}`;
}
