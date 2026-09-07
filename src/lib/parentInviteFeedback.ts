export type ParentInviteResponse = {
  sent?: number;
  error?: string;
  results?: {
    email: string;
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    error?: string;
  }[];
};

/** Keep skipped invitations and partial failures visible even on HTTP 200. */
export function parentInviteProblem(
  response: ParentInviteResponse,
  requestOk: boolean,
  t: (key: string) => string,
): string | null {
  const messages: string[] = [];
  for (const result of response.results ?? []) {
    if (result.skipped && result.reason === 'already_registered') {
      messages.push(`${result.email}: ${t('compStu.inviteSkippedAlreadyRegistered')}`);
    } else if (!result.ok) {
      messages.push(`${result.email}: ${t('compStu.parentInviteEmailFailed')}`);
    }
  }
  if (!requestOk && messages.length === 0) {
    messages.push(response.error || t('compStu.parentInviteEmailFailed'));
  }
  return messages.length ? [...new Set(messages)].join('\n') : null;
}
