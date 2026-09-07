export type SchoolContractPartyKind = 'student' | 'teacher';

export function schoolContractPartyKind(value: unknown): SchoolContractPartyKind {
  return String(value || 'student') === 'teacher' ? 'teacher' : 'student';
}

export function isTeacherSchoolContract(contract: { party_kind?: string | null } | null | undefined): boolean {
  return schoolContractPartyKind(contract?.party_kind) === 'teacher';
}
