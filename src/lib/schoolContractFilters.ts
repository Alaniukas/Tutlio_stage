export type SchoolContractSigningStatus =
  | 'draft'
  | 'sent'
  | 'awaiting_school_signature'
  | 'signed_by_school'
  | 'signed';

export type SchoolContractFilter =
  | 'all'
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

export type SchoolContractFilterInput = {
  signing_status: SchoolContractSigningStatus;
  media_publicity_consent?: string | null;
  student?: SchoolContractStudentFields | null;
};

export const CONTRACT_MISSING_FIELD_LABELS = {
  address: 'Gyvenamoji vieta',
  birthDate: 'Vaiko gimimo data',
  parentPersonalCode: 'Tėvų asmens kodas',
  parentPhone: 'Tėvų tel. nr.',
  mediaConsent: 'Vaiko atvaizdo naudojimo sutikimas',
} as const;

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
    const consent = String(contract.media_publicity_consent || student?.media_publicity_consent || '').trim();
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
): boolean {
  if (filter === 'all') return true;
  if (filter === 'signed') return contract.signing_status === 'signed';
  if (filter === 'awaiting_school') return contract.signing_status === 'awaiting_school_signature';
  if (filter === 'awaiting_parents') return contract.signing_status === 'signed_by_school';
  if (filter === 'incomplete_data') {
    return contract.signing_status !== 'signed'
      && getContractMissingFieldLabels(contract, isSchoolView).length > 0;
  }
  return true;
}

export function countContractsByFilter(
  contracts: SchoolContractFilterInput[],
  isSchoolView: boolean,
): Record<SchoolContractFilter, number> {
  const filters: SchoolContractFilter[] = [
    'all',
    'signed',
    'awaiting_school',
    'awaiting_parents',
    'incomplete_data',
  ];
  const counts = {} as Record<SchoolContractFilter, number>;
  for (const filter of filters) {
    counts[filter] = contracts.filter((c) => matchesContractFilter(filter, c, isSchoolView)).length;
  }
  return counts;
}

export function contractFilterSupportsExport(filter: SchoolContractFilter): boolean {
  return filter === 'awaiting_parents' || filter === 'incomplete_data';
}
