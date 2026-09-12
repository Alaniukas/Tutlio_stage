export interface SessionCommentDeliveryInput {
  nextComment: string;
  previousComment?: string | null;
  showToStudent: boolean;
  showToParent: boolean;
  previousShowToStudent?: boolean | null;
  previousShowToParent?: boolean | null;
  studentEmail?: string | null;
  parentEmails?: Array<string | null | undefined>;
}

export function sessionCommentDeliveryNeeded(input: SessionCommentDeliveryInput): boolean {
  const nextComment = input.nextComment.trim();
  if (!nextComment) return false;
  const commentChanged = nextComment !== String(input.previousComment || '').trim();
  return Boolean(
    (input.showToStudent && (commentChanged || !input.previousShowToStudent))
    || (input.showToParent && (commentChanged || !input.previousShowToParent)),
  );
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

/**
 * Resolve only the recipients who need a new comment notification.
 *
 * Keeping the previous audience in the calculation is important: a tutor can
 * publish an unchanged comment to a parent later without re-emailing the
 * student, while editing the text notifies every currently selected audience.
 */
export function sessionCommentDeliveryRecipients(input: SessionCommentDeliveryInput): string[] {
  const nextComment = input.nextComment.trim();
  if (!nextComment) return [];

  const commentChanged = nextComment !== String(input.previousComment || '').trim();
  const notifyStudent = input.showToStudent && (commentChanged || !input.previousShowToStudent);
  const notifyParent = input.showToParent && (commentChanged || !input.previousShowToParent);
  const recipients = [
    ...(notifyStudent ? [input.studentEmail] : []),
    ...(notifyParent ? (input.parentEmails || []) : []),
  ]
    .map(normalizeEmail)
    .filter((email): email is string => !!email);

  return [...new Set(recipients)];
}

/** Existing student-visible comments stay visible to parents for compatibility. */
export function isSessionCommentVisibleToParent(session: {
  show_comment_to_student?: boolean | null;
  show_comment_to_parent?: boolean | null;
}): boolean {
  return Boolean(session.show_comment_to_student || session.show_comment_to_parent);
}
