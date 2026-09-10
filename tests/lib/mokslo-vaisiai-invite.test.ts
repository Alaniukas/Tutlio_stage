import { describe, expect, it } from 'vitest';
import {
  shouldProvisionAccountsOnCreate,
  shouldSendParentInviteOnCreate,
  shouldSendStudentInviteEmail,
} from '@/lib/moksloVaisiaiInvite';

describe('Mokslo vaisiai invite target helpers', () => {
  it('skips student invite email when parent is invited first or accounts are provisioned', () => {
    expect(shouldSendStudentInviteEmail('parent')).toBe(false);
    expect(shouldSendStudentInviteEmail('provision')).toBe(false);
    expect(shouldSendStudentInviteEmail('student')).toBe(true);
    expect(shouldSendStudentInviteEmail('both')).toBe(true);
  });

  it('sends parent invite for parent-first and both flows only', () => {
    expect(shouldSendParentInviteOnCreate('parent')).toBe(true);
    expect(shouldSendParentInviteOnCreate('both')).toBe(true);
    expect(shouldSendParentInviteOnCreate('student')).toBe(false);
    expect(shouldSendParentInviteOnCreate('provision')).toBe(false);
  });

  it('provisions accounts immediately for provision target', () => {
    expect(shouldProvisionAccountsOnCreate('provision')).toBe(true);
    expect(shouldProvisionAccountsOnCreate('parent')).toBe(false);
    expect(shouldProvisionAccountsOnCreate('both')).toBe(false);
  });
});
