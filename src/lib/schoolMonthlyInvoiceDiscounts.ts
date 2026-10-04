import type { SchoolLessonDiscountInput, SchoolLessonInvoiceSession } from './schoolMonthlyInvoiceLines.js';

export type SavedLessonDiscountRow = {
  student_id?: string;
  subject_id: string;
  tutor_id?: string | null;
  percent?: number | null;
  discount_type?: string | null;
  amount_eur?: number | null;
  valid_from?: string;
  valid_until?: string | null;
  note?: string | null;
  agreement_id?: string | null;
};

export type AcceptedDiscountAgreementRow = {
  id: string;
  student_id: string;
  contract_id: string;
  subject_id?: string | null;
  tutor_id?: string | null;
  discount_type: 'percent' | 'amount' | string;
  discount_value: number | string;
  valid_from: string;
  valid_until: string;
  note?: string | null;
  agreement_number?: string | null;
  status?: string;
};

export type DiscountContractRow = {
  id: string;
  class_group_id?: string | null;
};

export function discountAgreementNote(agreement: Pick<AcceptedDiscountAgreementRow, 'agreement_number' | 'note'>): string | null {
  return [agreement.agreement_number, agreement.note].filter(Boolean).join(': ') || null;
}

export function mapSavedLessonDiscount(row: SavedLessonDiscountRow): SchoolLessonDiscountInput {
  return {
    type: row.discount_type === 'amount' ? 'amount' : 'percent',
    value: row.discount_type === 'amount' ? Number(row.amount_eur || 0) : Number(row.percent || 0),
    subjectId: String(row.subject_id),
    tutorId: row.tutor_id ? String(row.tutor_id) : null,
    note: row.note || null,
    agreementId: row.agreement_id ? String(row.agreement_id) : null,
  };
}

export function mapAcceptedDiscountAgreement(
  agreement: AcceptedDiscountAgreementRow,
  contract?: DiscountContractRow | null,
): SchoolLessonDiscountInput {
  const classGroupId = contract?.class_group_id ? String(contract.class_group_id) : null;
  return {
    type: agreement.discount_type === 'amount' ? 'amount' : 'percent',
    value: Number(agreement.discount_value || 0),
    subjectId: agreement.subject_id ? String(agreement.subject_id) : (classGroupId || ''),
    tutorId: agreement.tutor_id ? String(agreement.tutor_id) : null,
    classGroupId,
    note: discountAgreementNote(agreement),
    agreementId: String(agreement.id),
  };
}

export function mergeLessonDiscountInputs(
  saved: SchoolLessonDiscountInput[],
  fromAgreements: SchoolLessonDiscountInput[],
): SchoolLessonDiscountInput[] {
  const linkedAgreementIds = new Set(saved.map((row) => row.agreementId).filter(Boolean));
  return [
    ...saved,
    ...fromAgreements.filter((row) => !row.agreementId || !linkedAgreementIds.has(row.agreementId)),
  ];
}

export function findLessonDiscountForSession(
  discounts: SchoolLessonDiscountInput[],
  session: Pick<SchoolLessonInvoiceSession, 'subjectId' | 'tutorId' | 'classGroupId'>,
): SchoolLessonDiscountInput | undefined {
  return discounts.find((candidate) => {
    if (candidate.tutorId && candidate.tutorId !== session.tutorId) return false;
    if (candidate.subjectId && candidate.subjectId === session.subjectId) return true;
    const groupId = session.classGroupId || null;
    if (candidate.classGroupId && (candidate.classGroupId === groupId || candidate.classGroupId === session.subjectId)) {
      return true;
    }
    return false;
  });
}
