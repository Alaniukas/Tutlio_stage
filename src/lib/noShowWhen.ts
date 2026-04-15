export type NoShowWhen = 'before_lesson' | 'during_lesson' | 'after_lesson';

export function defaultNoShowWhenForNow(start: Date, end: Date, now = new Date()): NoShowWhen {
  if (now < start) return 'before_lesson';
  if (now < end) return 'during_lesson';
  return 'after_lesson';
}

export function noShowWhenLabelLt(w: NoShowWhen | string | null | undefined): string {
  switch (w) {
    case 'before_lesson':
      return 'Prieš pamoką';
    case 'during_lesson':
      return 'Pamokos metu';
    case 'after_lesson':
      return 'Po pamokos';
    default:
      return '';
  }
}

export function noShowTutorCommentLine(w: NoShowWhen): string {
  return `Mokinys neatvyko (${noShowWhenLabelLt(w).toLowerCase()}).`;
}

export function buildNoShowSessionPatch(
  when: NoShowWhen,
  existingTutorComment: string | null | undefined,
): { status: 'no_show'; no_show_when: NoShowWhen; tutor_comment: string } {
  const line = noShowTutorCommentLine(when);
  const prev = (existingTutorComment || '').trim();
  const tutor_comment = prev ? `${prev}\n${line}` : line;
  return { status: 'no_show', no_show_when: when, tutor_comment };
}
