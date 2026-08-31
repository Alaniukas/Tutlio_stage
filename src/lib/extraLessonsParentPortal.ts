import {
  ANNUAL_CONTRACT_KIND,
  EXTRA_LESSONS_CONTRACT_KIND,
  extraLessonsEndKind,
  isExtraLessonsContractKind,
  isWithinWithdrawalWindow,
} from './extraLessonsContract.js';

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

export type ParentSchoolContractDbRow = ExtraLessonsParentContractRow & {
  kind?: string | null;
  signing_status?: string | null;
  party_kind?: string | null;
};

export function isParentVisibleSchoolContract(row: { party_kind?: string | null }): boolean {
  return String(row.party_kind || 'student') !== 'teacher';
}

export function parentSchoolContractStatusI18nKey(status: string | null | undefined): string {
  switch (status) {
    case 'draft':
      return 'school.filterDraft';
    case 'sent':
      return 'school.filterSent';
    case 'awaiting_school_signature':
      return 'school.filterAwaitingSchool';
    case 'signed_by_school':
      return 'school.filterAwaitingParents';
    case 'signed':
      return 'school.filterSigned';
    default:
      return 'school.filterUnsigned';
  }
}

export function mapParentSchoolContract(
  row: ParentSchoolContractDbRow,
  studentName: string,
  now: Date = new Date(),
) {
  const extra = isExtraLessonsContractKind(row.kind);
  const mapped = extra
    ? mapExtraLessonsParentContract(row, studentName, now)
    : {
        id: row.id,
        contractNumber: row.contract_number,
        revisionLabel: row.revision_label,
        studentName,
        acceptedAt: row.accepted_at,
        withdrawn: false,
        extraEndKind: null as string | null,
        startWithin14Status: row.start_within_14_status,
        canWithdraw: false,
        canTerminate: false,
        hasPdf: Boolean(row.signed_contract_url || row.pdf_url),
        hasStatement: false,
      };
  return {
    ...mapped,
    kind: extra ? EXTRA_LESSONS_CONTRACT_KIND : ANNUAL_CONTRACT_KIND,
    signingStatus: row.signing_status || null,
  };
}
