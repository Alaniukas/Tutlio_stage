import type { InvoiceRegeneration } from './invoiceRegeneration.js';

export type SchoolPayerInvoiceStudentPreview = {
  studentId: string;
  fullName: string;
  grade?: string | null;
  totalEur: number;
  creditAppliedEur?: number;
  amountDueEur?: number;
  lessonCount: number;
  serviceCount?: number;
  reviewSessionIds: string[];
  reviewReasons?: Array<'unconfirmed' | 'contract_review' | 'missing_price'>;
  alreadyIssued: boolean;
  issuedInvoiceNumbers?: string[];
  issuedTotalEur?: number;
  payerEmail: string;
  payerName: string;
  detachedAt?: string | null;
  previewToken: string;
  regeneration?: InvoiceRegeneration;
};

export type SchoolPayerInvoiceGroup = {
  payerKey: string;
  payerName: string;
  payerEmail: string;
  students: SchoolPayerInvoiceStudentPreview[];
  totalEur: number;
  creditAppliedEur?: number;
  amountDueEur?: number;
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
  'lessonCount' | 'serviceCount' | 'reviewSessionIds' | 'alreadyIssued' | 'payerEmail'
>): boolean {
  return (row.lessonCount > 0 || (row.serviceCount || 0) > 0)
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
    const currentStudents = students.filter((row) => !row.detachedAt);
    const contacts = currentStudents.length ? currentStudents : students;
    const contact = contacts.find((row) => row.payerName.trim()) || contacts[0];
    const sendableStudentIds = students.filter(schoolStudentInvoiceSendable).map((row) => row.studentId);
    return {
      ...group,
      payerName: contact.payerName.trim() || contact.fullName,
      students,
      sendableStudentIds,
    };
  }).sort((a, b) => a.payerName.localeCompare(b.payerName, 'lt'));
}
