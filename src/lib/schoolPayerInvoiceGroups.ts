export type SchoolPayerInvoiceStudentPreview = {
  studentId: string;
  fullName: string;
  grade?: string | null;
  totalEur: number;
  lessonCount: number;
  reviewSessionIds: string[];
  reviewReasons?: Array<'unconfirmed' | 'contract_review'>;
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
  /** One combined S.F. per payer when all sendable siblings are ready. */
  sendableStudentIds: string[];
  payerPreviewToken?: string;
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

export function schoolPayerInvoiceSendable(group: Pick<
  SchoolPayerInvoiceGroup,
  'students' | 'sendableStudentIds'
>): boolean {
  return group.sendableStudentIds.length > 0
    && group.students.every((row) => (
      !schoolStudentInvoiceSendable(row) || group.sendableStudentIds.includes(row.studentId)
    ));
}

/** Group children under the same payer; siblings share one outbound S.F. at send time. */
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
    const sendableStudentIds = students.filter(schoolStudentInvoiceSendable).map((row) => row.studentId);
    return {
      ...group,
      students,
      sendableStudentIds,
    };
  }).sort((a, b) => a.payerName.localeCompare(b.payerName, 'lt'));
}
