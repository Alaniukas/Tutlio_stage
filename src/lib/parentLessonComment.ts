import { isManoKorepetitoriusOrg } from './marketMoney.js';

/** Parent lesson comment checkbox + email — only Mano Korepetitorius org. */
export function canChooseParentLessonComment(organizationId: string | null | undefined): boolean {
  return isManoKorepetitoriusOrg(organizationId);
}

export function sessionCommentVisibilityLabelKey(session: {
  show_comment_to_student?: boolean | null;
  show_comment_to_parent?: boolean | null;
}): string {
  if (session.show_comment_to_student && session.show_comment_to_parent) {
    return 'dash.visibleToStudentAndParent';
  }
  if (session.show_comment_to_parent) {
    return 'dash.visibleToParent';
  }
  if (session.show_comment_to_student) {
    return 'compSess.visibleToStudent';
  }
  return 'compSess.tutorCommentNotForStudent';
}
