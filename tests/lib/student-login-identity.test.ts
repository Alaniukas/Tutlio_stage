import { describe, expect, it } from 'vitest';
import {
  isStudentLoginName,
  loginIdentifierToEmail,
  studentLoginNameFromEmail,
} from '@/lib/studentLoginIdentity';

describe('student usernames', () => {
  it('normalizes legacy usernames consistently without changing normal emails', () => {
    expect(loginIdentifierToEmail(' MV-0123456789ABCDEF '))
      .toBe('mv-0123456789abcdef@student-login.tutlio.invalid');
    expect(loginIdentifierToEmail(' parent@example.com ')).toBe('parent@example.com');
    expect(studentLoginNameFromEmail('mv-0123456789abcdef@student-login.tutlio.invalid'))
      .toBe('mv-0123456789abcdef');
  });

  it('accepts the shorter readable username format case-insensitively', () => {
    expect(isStudentLoginName(' MV-7K4M-P9QD ')).toBe(true);
    expect(loginIdentifierToEmail(' MV-7K4M-P9QD '))
      .toBe('mv-7k4m-p9qd@student-login.tutlio.invalid');
    expect(studentLoginNameFromEmail('mv-7k4m-p9qd@student-login.tutlio.invalid'))
      .toBe('mv-7k4m-p9qd');
  });

  it('does not convert arbitrary names or similar domains', () => {
    expect(isStudentLoginName('mv-child')).toBe(false);
    expect(isStudentLoginName('mv-i1o0-abcd')).toBe(false);
    expect(studentLoginNameFromEmail('mv-0123456789abcdef@example.com')).toBeNull();
  });
});
