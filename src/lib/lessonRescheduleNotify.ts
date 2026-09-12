export type LessonRescheduleRecipientRole = 'student' | 'payer';

export type LessonRescheduleRecipient = {
  to: string;
  recipientRole: LessonRescheduleRecipientRole;
  studentName: string;
};

export function shouldNotifyParentOnLessonReschedule(
  isSchoolOrg: boolean,
  paymentPayer: string | null | undefined,
): boolean {
  if (isSchoolOrg) return true;
  return paymentPayer === 'parent';
}

export function uniqueTrimmedEmails(...values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const email = String(raw || '').trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function buildLessonRescheduleRecipients(input: {
  isSchoolOrg: boolean;
  studentEmail?: string | null;
  resolvedStudentEmail?: string | null;
  payerEmail?: string | null;
  secondaryParentEmail?: string | null;
  paymentPayer?: string | null;
  studentName: string;
}): LessonRescheduleRecipient[] {
  const recipients: LessonRescheduleRecipient[] = [];
  const studentTo = String(input.resolvedStudentEmail || input.studentEmail || '').trim();
  if (studentTo) {
    recipients.push({
      to: studentTo,
      recipientRole: 'student',
      studentName: input.studentName,
    });
  }

  if (!shouldNotifyParentOnLessonReschedule(input.isSchoolOrg, input.paymentPayer)) {
    return recipients;
  }

  for (const email of uniqueTrimmedEmails(input.payerEmail, input.secondaryParentEmail)) {
    recipients.push({
      to: email,
      recipientRole: 'payer',
      studentName: input.studentName,
    });
  }

  return recipients;
}
