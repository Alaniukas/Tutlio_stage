import { describe, expect, it } from 'vitest';
import {
  isSelfBookedSession,
  normalizeSessionCreatedByRole,
  sessionCreatedByRoleLabelKey,
} from '@/lib/sessionCreatedByRole';

describe('sessionCreatedByRole', () => {
  it('normalizes known roles', () => {
    expect(normalizeSessionCreatedByRole('student')).toBe('student');
    expect(normalizeSessionCreatedByRole(' parent ')).toBe('parent');
    expect(normalizeSessionCreatedByRole('ORG_ADMIN')).toBe('org_admin');
  });

  it('returns null for unknown roles', () => {
    expect(normalizeSessionCreatedByRole('')).toBeNull();
    expect(normalizeSessionCreatedByRole('hacker')).toBeNull();
  });

  it('maps self-booked roles to label keys', () => {
    expect(sessionCreatedByRoleLabelKey('student')).toBe('session.createdBy.student');
    expect(sessionCreatedByRoleLabelKey('parent')).toBe('session.createdBy.parent');
    expect(sessionCreatedByRoleLabelKey('tutor')).toBeNull();
  });

  it('detects self-booked sessions', () => {
    expect(isSelfBookedSession('student')).toBe(true);
    expect(isSelfBookedSession('parent')).toBe(true);
    expect(isSelfBookedSession('tutor')).toBe(false);
    expect(isSelfBookedSession('org_admin')).toBe(false);
  });
});
