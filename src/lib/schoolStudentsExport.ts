import { parseStudentGrade } from './organizationDynamicPricing';
import { signingStatusLabel } from './schoolFinanceExport';
import {
  enrollmentStatusLabelKey,
  exitReasonLabelKey,
  normalizeEnrollmentStatus,
  type EnrollmentStatus,
  type ExitReason,
} from './schoolStudentEnrollment';

export type MediaConsentFilter = 'all' | 'agree' | 'disagree' | 'unknown';

export type SchoolStudentExportColumnId =
  | 'studentName'
  | 'grade'
  | 'mediaConsent'
  | 'contractStatus'
  | 'parentName'
  | 'parentEmail'
  | 'parentPhone'
  | 'schoolYear'
  | 'enrollmentStatus'
  | 'municipality'
  | 'exitDate'
  | 'exitReason'
  | 'exitNote'
  | 'hasDebt';

export const DEFAULT_SCHOOL_STUDENT_EXPORT_COLUMNS: SchoolStudentExportColumnId[] = [
  'studentName',
  'grade',
  'mediaConsent',
  'contractStatus',
  'parentName',
  'parentEmail',
  'parentPhone',
];

export const ALL_SCHOOL_STUDENT_EXPORT_COLUMNS: SchoolStudentExportColumnId[] = [
  ...DEFAULT_SCHOOL_STUDENT_EXPORT_COLUMNS,
  'schoolYear',
  'enrollmentStatus',
  'municipality',
  'exitDate',
  'exitReason',
  'exitNote',
  'hasDebt',
];

export type SchoolStudentExportInput = {
  id: string;
  full_name: string;
  grade?: string | null;
  media_publicity_consent?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
  school_year?: string | null;
  enrollment_status?: string | null;
  municipality?: string | null;
  exit_date?: string | null;
  exit_reason?: string | null;
  exit_note?: string | null;
  has_debt_manual?: boolean | null;
};

export type SchoolStudentContractInput = {
  signing_status: string;
} | null | undefined;

export type SchoolStudentExportRow = {
  studentName: string;
  grade: string;
  mediaConsent: string;
  contractStatus: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  schoolYear: string;
  enrollmentStatus: string;
  municipality: string;
  exitDate: string;
  exitReason: string;
  exitNote: string;
  hasDebt: string;
};

const COLUMN_HEADER_KEY: Record<SchoolStudentExportColumnId, string> = {
  studentName: 'school.studentExportColName',
  grade: 'school.studentExportColGrade',
  mediaConsent: 'school.studentExportColConsent',
  contractStatus: 'school.studentExportColContract',
  parentName: 'school.studentExportColParent',
  parentEmail: 'school.studentExportColEmail',
  parentPhone: 'school.studentExportColPhone',
  schoolYear: 'school.studentExportColSchoolYear',
  enrollmentStatus: 'school.studentExportColEnrollmentStatus',
  municipality: 'school.studentExportColMunicipality',
  exitDate: 'school.studentExportColExitDate',
  exitReason: 'school.studentExportColExitReason',
  exitNote: 'school.studentExportColExitNote',
  hasDebt: 'school.studentExportColHasDebt',
};

export function mediaConsentLabel(
  consent: string | null | undefined,
  t: (key: string) => string,
): string {
  const v = String(consent || '').trim().toLowerCase();
  if (v === 'agree') return t('compStu.mediaConsentAgree');
  if (v === 'disagree') return t('compStu.mediaConsentDisagree');
  return t('compStu.mediaConsentUnknown');
}

export function matchesMediaConsentFilter(
  consent: string | null | undefined,
  filter: MediaConsentFilter,
): boolean {
  if (filter === 'all') return true;
  const v = String(consent || '').trim().toLowerCase();
  if (filter === 'agree') return v === 'agree';
  if (filter === 'disagree') return v === 'disagree';
  return !v;
}

export function studentContractStatusLabel(
  contract: SchoolStudentContractInput,
  t: (key: string) => string,
): string {
  if (!contract) return t('compStu.contractNone');
  if (contract.signing_status === 'signed') return t('compStu.contractSigned');
  if (contract.signing_status === 'sent') return t('compStu.contractSent');
  if (contract.signing_status === 'draft') return t('compStu.contractNotSigned');
  return signingStatusLabel(contract.signing_status, t);
}

function gradeSortKey(grade: string | null | undefined): number {
  const parsed = parseStudentGrade(String(grade || ''));
  return parsed ?? 999;
}

function resolveExitReasonLabel(
  reason: string | null | undefined,
  t: (key: string) => string,
): string {
  const v = String(reason || '').trim();
  if (!v) return '';
  const known: ExitReason[] = [
    'chose_other_school',
    'returned_to_contact',
    'moved_abroad',
    'school_terminated',
    'other',
  ];
  if ((known as string[]).includes(v)) {
    return t(exitReasonLabelKey(v as ExitReason));
  }
  return v;
}

export function buildSchoolStudentExportRows(
  students: Array<{
    student: SchoolStudentExportInput;
    contract?: SchoolStudentContractInput;
    hasDebt?: boolean;
  }>,
  t: (key: string) => string,
  columns?: SchoolStudentExportColumnId[],
): SchoolStudentExportRow[] {
  const sorted = [...students].sort((a, b) => {
    const gradeDiff = gradeSortKey(a.student.grade) - gradeSortKey(b.student.grade);
    if (gradeDiff !== 0) return gradeDiff;
    return a.student.full_name.localeCompare(b.student.full_name, 'lt');
  });

  const rows = sorted.map(({ student, contract, hasDebt }) => {
    const status = normalizeEnrollmentStatus(student.enrollment_status) as EnrollmentStatus;
    return {
      studentName: student.full_name,
      grade: String(student.grade || '').trim(),
      mediaConsent: mediaConsentLabel(student.media_publicity_consent, t),
      contractStatus: studentContractStatusLabel(contract, t),
      parentName: String(student.payer_name || '').trim(),
      parentEmail: String(student.payer_email || '').trim(),
      parentPhone: String(student.payer_phone || '').trim(),
      schoolYear: String(student.school_year || '').trim(),
      enrollmentStatus: t(enrollmentStatusLabelKey(status)),
      municipality: String(student.municipality || '').trim(),
      exitDate: String(student.exit_date || '').trim(),
      exitReason: resolveExitReasonLabel(student.exit_reason, t),
      exitNote: String(student.exit_note || '').trim(),
      hasDebt: hasDebt ? t('compStu.debtYes') : t('compStu.debtNo'),
    };
  });

  // columns only affect table projection via schoolStudentsTableData; rows always full.
  void columns;
  return rows;
}

export function schoolStudentsTableData(
  rows: SchoolStudentExportRow[],
  t: (key: string) => string,
  columns?: SchoolStudentExportColumnId[],
): { headers: string[]; body: string[][] } {
  const cols =
    columns && columns.length > 0 ? columns : DEFAULT_SCHOOL_STUDENT_EXPORT_COLUMNS;
  const headers = cols.map((id) => t(COLUMN_HEADER_KEY[id]));
  const body = rows.map((row) => cols.map((id) => row[id]));
  return { headers, body };
}

export function schoolStudentExportColumnLabelKey(
  id: SchoolStudentExportColumnId,
): string {
  return COLUMN_HEADER_KEY[id];
}
