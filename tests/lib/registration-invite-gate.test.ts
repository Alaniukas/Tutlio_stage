import { describe, expect, it } from 'vitest';
import { shouldSkipStudentInvite } from '../../api/_lib/registrationInviteGate';

describe('shouldSkipStudentInvite', () => {
  it('skips when this student row is already linked', () => {
    expect(shouldSkipStudentInvite({ linkedUserId: 'u1', authUserExists: false, existingLinkedStudent: false })).toBe(true);
  });

  it('skips when Auth already has this email', () => {
    expect(shouldSkipStudentInvite({ linkedUserId: null, authUserExists: true, existingLinkedStudent: false })).toBe(true);
  });

  it('skips when another student row with this email is linked', () => {
    expect(shouldSkipStudentInvite({ linkedUserId: null, authUserExists: false, existingLinkedStudent: true })).toBe(true);
  });

  it('sends when the email is new', () => {
    expect(shouldSkipStudentInvite({ linkedUserId: null, authUserExists: false, existingLinkedStudent: false })).toBe(false);
  });
});
