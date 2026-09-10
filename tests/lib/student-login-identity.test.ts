import { describe, expect, it } from 'vitest';
import {
  isStudentLoginName,
  loginIdentifierToEmail,
  studentLoginNameFromEmail,
} from '@/lib/studentLoginIdentity';

describe('student usernames', () => {
  it('normalizes a username consistently without changing normal emails', () => {
    expect(loginIdentifierToEmail(' MV-0123456789ABCDEF '))
      .toBe('mv-0123456789abcdef@student-login.tutlio.invalid');
    expect(loginIdentifierToEmail(' parent@example.com ')).toBe('parent@example.com');
    expect(studentLoginNameFromEmail('mv-0123456789abcdef@student-login.tutlio.invalid'))
      .toBe('mv-0123456789abcdef');
  });

  it('does not convert arbitrary names or similar domains', () => {
    expect(isStudentLoginName('mv-child')).toBe(false);
    expect(studentLoginNameFromEmail('mv-0123456789abcdef@example.com')).toBeNull();
  });
});
