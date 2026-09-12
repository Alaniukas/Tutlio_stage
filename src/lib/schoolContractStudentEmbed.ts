/** Student columns shown on school contract UI (no nested PostgREST join required). */
export const SCHOOL_CONTRACT_STUDENT_SELECT =
  'id, full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent';

export type SchoolContractStudentEmbed = {
  full_name: string;
  email: string;
  phone?: string | null;
  payer_name: string | null;
  payer_email: string | null;
  payer_phone?: string | null;
  payer_personal_code?: string | null;
  parent_secondary_name?: string | null;
  parent_secondary_email?: string | null;
  parent_secondary_phone?: string | null;
  parent_secondary_personal_code?: string | null;
  parent_secondary_address?: string | null;
  student_address?: string | null;
  student_city?: string | null;
  child_birth_date?: string | null;
  media_publicity_consent?: boolean | null;
};

type StudentRow = { id: string } & Partial<SchoolContractStudentEmbed>;

export function studentRowToContractEmbed(row: StudentRow): SchoolContractStudentEmbed | undefined {
  if (!row?.id) return undefined;
  const { id: _id, ...fields } = row;
  return fields as SchoolContractStudentEmbed;
}

/** Join contracts with students client-side (avoids PostgREST embed when FK missing from schema cache). */
export function attachStudentsToContracts<T extends { student_id: string }>(
  contracts: T[],
  students: StudentRow[],
): Array<T & { student?: SchoolContractStudentEmbed }> {
  const byId = new Map(students.map((s) => [s.id, s]));
  return contracts.map((contract) => {
    const row = byId.get(contract.student_id);
    const student = row ? studentRowToContractEmbed(row) : undefined;
    return student ? { ...contract, student } : contract;
  });
}
