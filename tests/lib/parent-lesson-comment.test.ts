import { describe, expect, it } from 'vitest';
import {
  canChooseParentLessonComment,
  sessionCommentVisibilityLabelKey,
} from '@/lib/parentLessonComment';
import { MANO_KOREPETITORIUS_ORG_ID } from '@/lib/marketMoney';

describe('canChooseParentLessonComment', () => {
  it('is true only for Mano Korepetitorius org', () => {
    expect(canChooseParentLessonComment(MANO_KOREPETITORIUS_ORG_ID)).toBe(true);
    expect(canChooseParentLessonComment('other-org')).toBe(false);
    expect(canChooseParentLessonComment(null)).toBe(false);
  });
});

describe('sessionCommentVisibilityLabelKey', () => {
  it('maps visibility flags to i18n keys', () => {
    expect(
      sessionCommentVisibilityLabelKey({
        show_comment_to_student: true,
        show_comment_to_parent: true,
      }),
    ).toBe('dash.visibleToStudentAndParent');
    expect(
      sessionCommentVisibilityLabelKey({ show_comment_to_parent: true }),
    ).toBe('dash.visibleToParent');
    expect(
      sessionCommentVisibilityLabelKey({ show_comment_to_student: true }),
    ).toBe('compSess.visibleToStudent');
    expect(sessionCommentVisibilityLabelKey({})).toBe('compSess.tutorCommentNotForStudent');
  });
});
