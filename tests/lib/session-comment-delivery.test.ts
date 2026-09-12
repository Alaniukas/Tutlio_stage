import { describe, expect, it } from 'vitest';
import {
  isSessionCommentVisibleToParent,
  sessionCommentDeliveryNeeded,
  sessionCommentDeliveryRecipients,
} from '@/lib/sessionCommentDelivery';

describe('session comment delivery', () => {
  it('can notify parents without notifying the student', () => {
    expect(sessionCommentDeliveryRecipients({
      nextComment: 'Puikiai dirbo.',
      showToStudent: false,
      showToParent: true,
      studentEmail: 'student@example.test',
      parentEmails: ['parent@example.test', 'SECOND@example.test'],
    })).toEqual(['parent@example.test', 'second@example.test']);
  });

  it('adds a parent to an unchanged published comment without re-emailing the student', () => {
    expect(sessionCommentDeliveryRecipients({
      nextComment: 'Puikiai dirbo.',
      previousComment: 'Puikiai dirbo.',
      showToStudent: true,
      showToParent: true,
      previousShowToStudent: true,
      previousShowToParent: false,
      studentEmail: 'student@example.test',
      parentEmails: ['parent@example.test'],
    })).toEqual(['parent@example.test']);
  });

  it('notifies both selected audiences after the comment changes and deduplicates addresses', () => {
    expect(sessionCommentDeliveryRecipients({
      nextComment: 'Atnaujintas komentaras',
      previousComment: 'Senas komentaras',
      showToStudent: true,
      showToParent: true,
      previousShowToStudent: true,
      previousShowToParent: true,
      studentEmail: 'same@example.test',
      parentEmails: ['SAME@example.test', 'other@example.test'],
    })).toEqual(['same@example.test', 'other@example.test']);
  });

  it('keeps old student-visible comments visible in the parent portal', () => {
    expect(isSessionCommentVisibleToParent({ show_comment_to_student: true })).toBe(true);
    expect(isSessionCommentVisibleToParent({ show_comment_to_parent: true })).toBe(true);
    expect(isSessionCommentVisibleToParent({})).toBe(false);
  });

  it('distinguishes no matching email from a comment that was already delivered', () => {
    expect(sessionCommentDeliveryNeeded({
      nextComment: 'Tas pats',
      previousComment: 'Tas pats',
      showToStudent: true,
      showToParent: true,
      previousShowToStudent: true,
      previousShowToParent: true,
    })).toBe(false);
    expect(sessionCommentDeliveryNeeded({
      nextComment: 'Tas pats',
      previousComment: 'Tas pats',
      showToStudent: true,
      showToParent: true,
      previousShowToStudent: true,
      previousShowToParent: false,
    })).toBe(true);
  });
});
