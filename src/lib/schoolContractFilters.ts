export type SchoolContractSigningStatus =
  | 'draft'
  | 'sent'
  | 'awaiting_school_signature'
  | 'signed_by_school'
  | 'signed';

export type SchoolContractFilter =
  | 'all'
  | 'draft'
  | 'sent'
  | 'signed'
  | 'awaiting_school'
  | 'awaiting_parents'
  | 'incomplete_data';

export type SchoolContractStudentFields = {
  full_name?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
  student_address?: string | null;
  student_city?: string | null;
  child_birth_date?: string | null;
  payer_personal_code?: string | null;
  media_publicity_consent?: string | null;
};

export type SchoolContractSignatureFields = {
  role: string;
  status: string;
  signed_pdf_path?: string | null;
};

export type SchoolContractFilterInput = {
  signing_status: SchoolContractSigningStatus;
  media_publicity_consent?: string | null;
  completion_submitted_at?: string | null;
  student?: SchoolContractStudentFields | null;
  signatures?: SchoolContractSignatureFields[] | null;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
};

export type SchoolContractFilterOptions = {
  /** Parent confirmation form exists only in the e-sign school flow. */
  eSignEnabled?: boolean;
};

export const CONTRACT_MISSING_FIELD_LABELS = {
  address: 'Gyvenamoji vieta',
  birthDate: 'Vaiko gimimo data',
  parentPersonalCode: 'Tėvų asmens kodas',
  parentPhone: 'Tėvų tel. nr.',
  mediaConsent: 'Vaiko atvaizdo naudojimo sutikimas',
} as const;

export function schoolHasSigned(
  contract: Pick<SchoolContractFilterInput, 'signatures'>,
): boolean {
  return (contract.signatures || []).some((row) => row.role === 'school' && row.status === 'signed');
}

/** Latest PDF to open in the school list: newest signature, then stored copies. */
export function currentContractPdfPath(
  contract: Pick<SchoolContractFilterInput, 'signatures' | 'pdf_url' | 'signed_contract_url'>,
): string | null {
  const signedByRole = (role: string) =>
    (contract.signatures || []).find((row) => row.role === role && row.status === 'signed' && row.signed_pdf_path)
      ?.signed_pdf_path || null;
  return signedByRole('parent_secondary')
    || signedByRole('parent_primary')
    || signedByRole('school')
    || contract.signed_contract_url
    || contract.pdf_url
    || null;
}

export function schoolCanInitiateSignature(
  contract: Pick<SchoolContractFilterInput, 'signing_status' | 'completion_submitted_at' | 'signatures'>,
): boolean {
  if (schoolHasSigned(contract)) return false;
  // Folder "Nepasirašyta mokyklos" must always offer the director button,
  // including paper scans uploaded before the Tutlio confirmation form.
  if (contract.signing_status === 'awaiting_school_signature') return true;
  if (contract.signing_status !== 'signed_by_school') return false;
  return Boolean(String(contract.completion_submitted_at || '').trim());
}

/** Ask the admin where to file a photo/PDF scan — Tutlio does not inspect signatures. */
export function shouldPromptSchoolSignedOnScan(
  contract: Pick<SchoolContractFilterInput, 'signing_status' | 'signatures'>,
  eSignEnabled: boolean,
): boolean {
  if (!eSignEnabled) return false;
  if (contract.signing_status === 'signed') return false;
  if (schoolHasSigned(contract)) return false;
  return true;
}

export function getContractMissingFieldLabels(
  contract: SchoolContractFilterInput,
  isSchoolView: boolean,
): string[] {
  const student = contract.student;
  const missing: string[] = [];

  if (!(student?.student_address || '').trim() && !(student?.student_city || '').trim()) {
    missing.push(CONTRACT_MISSING_FIELD_LABELS.address);
  }
  if (!(student?.child_birth_date || '').trim()) {
    missing.push(CONTRACT_MISSING_FIELD_LABELS.birthDate);
  }
  if (!(student?.payer_personal_code || '').trim()) {
    missing.push(CONTRACT_MISSING_FIELD_LABELS.parentPersonalCode);
  }
  if (!(student?.payer_phone || '').trim()) {
    missing.push(CONTRACT_MISSING_FIELD_LABELS.parentPhone);
  }
  if (isSchoolView) {
    // This contract's consent is filled on the parent confirmation form.
    // Do not treat leftover student-record consent (sibling / previous year) as complete.
    const consent = String(contract.media_publicity_consent || '').trim();
    if (!consent) {
      missing.push(CONTRACT_MISSING_FIELD_LABELS.mediaConsent);
    }
  }

  return missing;
}

export function matchesContractFilter(
  filter: SchoolContractFilter,
  contract: SchoolContractFilterInput,
  isSchoolView: boolean,
  options?: SchoolContractFilterOptions,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'draft') return contract.signing_status === 'draft';
  if (filter === 'sent') return contract.signing_status === 'sent';
  if (filter === 'signed') return contract.signing_status === 'signed';
  if (filter === 'awaiting_school') {
    if (contract.signing_status === 'awaiting_school_signature') return true;
    // Parent-signed copy (or a bad status jump) must not sit in "signed by school"
    // until the school signature actually exists.
    return contract.signing_status === 'signed_by_school' && !schoolHasSigned(contract);
  }
  if (filter === 'awaiting_parents') {
    return contract.signing_status === 'signed_by_school' && schoolHasSigned(contract);
  }
  if (filter === 'incomplete_data') {
    if (contract.signing_status === 'signed') return false;
    if (getContractMissingFieldLabels(contract, isSchoolView).length > 0) return true;
    // Yellow banner: sent, waiting for parents to confirm data on Tutlio.
    if (options?.eSignEnabled && contract.signing_status === 'sent' && !contract.completion_submitted_at) {
      return true;
    }
    return false;
  }
  return true;
}

export function countContractsByFilter(
  contracts: SchoolContractFilterInput[],
  isSchoolView: boolean,
  options?: SchoolContractFilterOptions,
): Record<SchoolContractFilter, number> {
  const filters: SchoolContractFilter[] = [
    'all',
    'draft',
    'sent',
    'signed',
    'awaiting_school',
    'awaiting_parents',
    'incomplete_data',
  ];
  const counts = {} as Record<SchoolContractFilter, number>;
  for (const filter of filters) {
    counts[filter] = contracts.filter((c) => matchesContractFilter(filter, c, isSchoolView, options)).length;
  }
  return counts;
}

export function contractFilterSupportsExport(filter: SchoolContractFilter): boolean {
  return filter === 'awaiting_parents' || filter === 'incomplete_data';
}
