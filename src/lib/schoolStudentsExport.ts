import { parseStudentGrade } from './organizationDynamicPricing';
import { signingStatusLabel } from './schoolFinanceExport';

export type MediaConsentFilter = 'all' | 'agree' | 'disagree' | 'unknown';

export type SchoolStudentExportInput = {
  id: string;
  full_name: string;
  grade?: string | null;
  media_publicity_consent?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
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

export function buildSchoolStudentExportRows(
  students: Array<{ student: SchoolStudentExportInput; contract?: SchoolStudentContractInput }>,
  t: (key: string) => string,
): SchoolStudentExportRow[] {
  const sorted = [...students].sort((a, b) => {
    const gradeDiff = gradeSortKey(a.student.grade) - gradeSortKey(b.student.grade);
    if (gradeDiff !== 0) return gradeDiff;
    return a.student.full_name.localeCompare(b.student.full_name, 'lt');
  });

  return sorted.map(({ student, contract }) => ({
    studentName: student.full_name,
    grade: String(student.grade || '').trim(),
    mediaConsent: mediaConsentLabel(student.media_publicity_consent, t),
    contractStatus: studentContractStatusLabel(contract, t),
    parentName: String(student.payer_name || '').trim(),
    parentEmail: String(student.payer_email || '').trim(),
    parentPhone: String(student.payer_phone || '').trim(),
  }));
}

export function schoolStudentsTableData(
  rows: SchoolStudentExportRow[],
  t: (key: string) => string,
): { headers: string[]; body: string[][] } {
  const headers = [
    t('school.studentExportColName'),
    t('school.studentExportColGrade'),
    t('school.studentExportColConsent'),
    t('school.studentExportColContract'),
    t('school.studentExportColParent'),
    t('school.studentExportColEmail'),
    t('school.studentExportColPhone'),
  ];
  const body = rows.map((row) => [
    row.studentName,
    row.grade,
    row.mediaConsent,
    row.contractStatus,
    row.parentName,
    row.parentEmail,
    row.parentPhone,
  ]);
  return { headers, body };
}
