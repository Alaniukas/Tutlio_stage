import { describe, expect, it } from 'vitest';
import { generateStudentLoginName } from '../../api/_lib/generateStudentLoginName.js';
import { isStudentLoginName } from '@/lib/studentLoginIdentity';

describe('generateStudentLoginName', () => {
  it('creates a short readable username without ambiguous characters', () => {
    for (let index = 0; index < 25; index += 1) {
      const loginName = generateStudentLoginName();
      expect(loginName).toMatch(/^mv-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
      expect(loginName).not.toMatch(/[ilo01]/);
      expect(isStudentLoginName(loginName)).toBe(true);
    }
  });

  it('creates Pro Klasė usernames with the same safe alphabet', () => {
    const loginName = generateStudentLoginName('pk');
    expect(loginName).toMatch(/^pk-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
    expect(isStudentLoginName(loginName)).toBe(true);
  });
});
