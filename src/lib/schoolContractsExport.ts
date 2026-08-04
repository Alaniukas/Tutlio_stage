import type { SchoolContractFilterInput } from './schoolContractFilters';
import { getContractMissingFieldLabels } from './schoolContractFilters';
import { signingStatusLabel } from './schoolFinanceExport';

export type SchoolContractExportRow = {
  contractNumber: string;
  studentName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  signingStatus: string;
  missingFields: string;
  annualFee: number;
  createdAt: string;
};

export type SchoolContractExportSource = SchoolContractFilterInput & {
  contract_number?: string | null;
  annual_fee?: number;
  created_at?: string;
};

export function buildSchoolContractExportRows(
  contracts: SchoolContractExportSource[],
  t: (key: string) => string,
  isSchoolView: boolean,
): SchoolContractExportRow[] {
  return contracts.map((contract) => {
    const student = contract.student;
    const missing = getContractMissingFieldLabels(contract, isSchoolView);
    return {
      contractNumber: String(contract.contract_number || '').trim(),
      studentName: String(student?.full_name || '').trim(),
      parentName: String(student?.payer_name || '').trim(),
      parentEmail: String(student?.payer_email || '').trim(),
      parentPhone: String(student?.payer_phone || '').trim(),
      signingStatus: signingStatusLabel(contract.signing_status, t),
      missingFields: missing.join(', '),
      annualFee: Number(contract.annual_fee) || 0,
      createdAt: contract.created_at
        ? new Date(contract.created_at).toLocaleDateString('lt-LT')
        : '',
    };
  });
}

export function schoolContractsTableData(
  rows: SchoolContractExportRow[],
  t: (key: string) => string,
): { headers: string[]; body: (string | number)[][] } {
  const headers = [
    t('school.contractExportColNumber'),
    t('school.contractExportColStudent'),
    t('school.contractExportColParent'),
    t('school.contractExportColEmail'),
    t('school.contractExportColPhone'),
    t('school.contractExportColStatus'),
    t('school.contractExportColMissing'),
    t('school.contractExportColAnnualFee'),
    t('school.contractExportColCreated'),
  ];
  const body = rows.map((row) => [
    row.contractNumber,
    row.studentName,
    row.parentName,
    row.parentEmail,
    row.parentPhone,
    row.signingStatus,
    row.missingFields,
    row.annualFee,
    row.createdAt,
  ]);
  return { headers, body };
}
