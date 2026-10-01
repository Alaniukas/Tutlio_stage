export type SchoolPayerInvoiceStudentPreview = {
  studentId: string;
  fullName: string;
  grade?: string | null;
  totalEur: number;
  lessonCount: number;
  reviewSessionIds: string[];
  alreadyIssued: boolean;
  payerEmail: string;
  payerName: string;
  previewToken: string;
};

export type SchoolPayerInvoiceGroup = {
  payerKey: string;
  payerName: string;
  payerEmail: string;
  students: SchoolPayerInvoiceStudentPreview[];
  totalEur: number;
  sendableStudentIds: string[];
};

export function schoolPayerKey(payerEmail?: string | null, studentId?: string | null): string {
  const email = String(payerEmail || '').trim().toLowerCase();
  return email || `student:${studentId || ''}`;
}

export function schoolStudentInvoiceSendable(row: Pick<
  SchoolPayerInvoiceStudentPreview,
  'lessonCount' | 'reviewSessionIds' | 'alreadyIssued' | 'payerEmail'
>): boolean {
  return row.lessonCount > 0
    && !row.alreadyIssued
    && row.reviewSessionIds.length === 0
    && Boolean(String(row.payerEmail || '').trim());
}

/** One S.F. email per child, grouped under the payer so siblings are not mixed with other families. */
export function groupSchoolPayerInvoicePreviews(
  rows: SchoolPayerInvoiceStudentPreview[],
): SchoolPayerInvoiceGroup[] {
  const map = new Map<string, SchoolPayerInvoiceGroup>();
  for (const row of rows) {
    const payerKey = schoolPayerKey(row.payerEmail, row.studentId);
    const current = map.get(payerKey) || {
      payerKey,
      payerName: row.payerName || row.fullName,
      payerEmail: String(row.payerEmail || '').trim(),
      students: [],
      totalEur: 0,
      sendableStudentIds: [],
    };
    current.students.push(row);
    current.totalEur = Math.round((current.totalEur + Number(row.totalEur || 0)) * 100) / 100;
    map.set(payerKey, current);
  }
  return [...map.values()].map((group) => {
    const students = group.students.sort((a, b) => a.fullName.localeCompare(b.fullName, 'lt'));
    return {
      ...group,
      students,
      sendableStudentIds: students.filter(schoolStudentInvoiceSendable).map((row) => row.studentId),
    };
  }).sort((a, b) => a.payerName.localeCompare(b.payerName, 'lt'));
}
