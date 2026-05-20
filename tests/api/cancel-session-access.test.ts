import { describe, it, expect } from 'vitest';
import {
  canStudentSideCancelSession,
  canTutorSideCancelSession,
} from '../../api/_lib/cancel-session-access';

describe('cancel-session access helpers', () => {
  describe('canTutorSideCancelSession', () => {
    it('allows the session tutor', () => {
      expect(canTutorSideCancelSession('tutor-1', 'tutor-1', false)).toBe(true);
    });

    it('allows org admin acting on org tutor session', () => {
      expect(canTutorSideCancelSession('admin-1', 'tutor-1', true)).toBe(true);
    });

    it('denies unrelated tutor', () => {
      expect(canTutorSideCancelSession('other-tutor', 'tutor-1', false)).toBe(false);
    });
  });

  describe('canStudentSideCancelSession', () => {
    it('allows linked student account', () => {
      expect(canStudentSideCancelSession('student-user', 'student-user', [])).toBe(true);
    });

    it('allows parent linked to child', () => {
      expect(
        canStudentSideCancelSession('parent-user', 'child-student-user', ['parent-user'])
      ).toBe(true);
    });

    it('denies unrelated user', () => {
      expect(
        canStudentSideCancelSession('stranger', 'child-student-user', ['parent-user'])
      ).toBe(false);
    });

    it('allows when linked_user_id is null but parent list matches', () => {
      expect(canStudentSideCancelSession('parent-user', null, ['parent-user'])).toBe(true);
    });
  });
});
