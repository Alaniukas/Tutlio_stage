import { describe, expect, it } from 'vitest';
import { generateTempPassword } from '../../api/_lib/generateTempPassword.js';

describe('generateTempPassword', () => {
  it('returns readable passwords of requested length', () => {
    const pw = generateTempPassword(12);
    expect(pw).toHaveLength(12);
    expect(pw).toMatch(/^[A-Za-z0-9]+$/);
    expect(pw).not.toMatch(/[0O1lI]/);
  });
});
