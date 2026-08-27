import {
  extraLessonsEndKind,
  isWithinWithdrawalWindow,
} from './extraLessonsContract';

export function uniqueStudentIds(
  rows: Array<{ id?: string | null } | null | undefined>,
): string[] {
  return [...new Set(rows.map((r) => r?.id).filter((id): id is string => Boolean(id)))];
}

export function parentMayEndExtraLessonsContract(input: {
  authUserId: string;
  acceptedByUserId?: string | null;
  studentLinkedUserId?: string | null;
  studentParentUserId?: string | null;
}): boolean {
  const uid = input.authUserId;
  if (!uid) return false;
  return uid === input.acceptedByUserId
    || uid === input.studentLinkedUserId
    || uid === input.studentParentUserId;
}

export type ExtraLessonsParentContractRow = {
  id: string;
  contract_number: string | null;
  revision_label: string | null;
  accepted_at: string | null;
  signed_contract_url?: string | null;
  pdf_url?: string | null;
  extra_end_statement_path?: string | null;
  withdrawal_requested_at?: string | null;
  extra_end_kind?: string | null;
  start_within_14_status?: string | null;
  student_id: string;
};

export function mapExtraLessonsParentContract(
  row: ExtraLessonsParentContractRow,
  studentName: string,
  now: Date = new Date(),
) {
  const withdrawn = Boolean(row.withdrawal_requested_at);
  const acceptedAt = row.accepted_at;
  return {
    id: row.id,
    contractNumber: row.contract_number,
    revisionLabel: row.revision_label,
    studentName,
    acceptedAt,
    withdrawn,
    extraEndKind: row.extra_end_kind || null,
    startWithin14Status: row.start_within_14_status,
    canWithdraw: Boolean(acceptedAt) && !withdrawn && isWithinWithdrawalWindow(acceptedAt, now),
    canTerminate: Boolean(acceptedAt) && !withdrawn && extraLessonsEndKind(acceptedAt, now) === 'termination',
    hasPdf: Boolean(row.signed_contract_url || row.pdf_url),
    hasStatement: Boolean(row.extra_end_statement_path),
  };
}
