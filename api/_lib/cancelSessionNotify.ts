/**
 * Who must be emailed when a session is cancelled.
 * Contacts come from the student row (not the browser payload), so org-admin
 * cancels that omit emails still notify the family.
 */

export type CancellationNotifyKind = 'tutor' | 'student' | 'parent';

export type CancellationNotifyRecipient = {
  email: string;
  kind: CancellationNotifyKind;
};

function norm(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

function isAddress(email: string): boolean {
  return email.includes('@');
}

/**
 * Deduped list: payer + secondary parent + student + tutor.
 * First matching role wins when the same address appears twice
 * (payer/student often share one inbox at schools).
 */
export function collectCancellationNotifyRecipients(opts: {
  tutorEmail?: string | null;
  studentEmail?: string | null;
  payerEmail?: string | null;
  parentSecondaryEmail?: string | null;
}): CancellationNotifyRecipient[] {
  const seen = new Set<string>();
  const out: CancellationNotifyRecipient[] = [];

  const add = (raw: string | null | undefined, kind: CancellationNotifyKind) => {
    const email = String(raw || '').trim();
    const key = norm(email);
    if (!isAddress(key) || seen.has(key)) return;
    seen.add(key);
    out.push({ email, kind });
  };

  add(opts.payerEmail, 'parent');
  add(opts.parentSecondaryEmail, 'parent');
  add(opts.studentEmail, 'student');
  add(opts.tutorEmail, 'tutor');
  return out;
}
