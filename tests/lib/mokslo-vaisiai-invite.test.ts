import { describe, expect, it } from 'vitest';
import {
  shouldSendParentInviteOnCreate,
  shouldSendStudentInviteEmail,
} from '@/lib/moksloVaisiaiInvite';

describe('Mokslo vaisiai invite target helpers', () => {
  it('skips student invite email when parent is invited first', () => {
    expect(shouldSendStudentInviteEmail('parent')).toBe(false);
    expect(shouldSendStudentInviteEmail('student')).toBe(true);
    expect(shouldSendStudentInviteEmail('both')).toBe(true);
  });

  it('sends parent invite for parent-first and both flows', () => {
    expect(shouldSendParentInviteOnCreate('parent')).toBe(true);
    expect(shouldSendParentInviteOnCreate('both')).toBe(true);
    expect(shouldSendParentInviteOnCreate('student')).toBe(false);
  });
});
