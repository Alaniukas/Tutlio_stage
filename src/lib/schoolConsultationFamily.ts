export type ConsultationFamilyStudent = {
  payer_personal_code?: string | null;
  payer_email?: string | null;
  organization_id?: string | null;
};

export function consultationFamilyKey(student: ConsultationFamilyStudent): string | null {
  const code = String(student.payer_personal_code || '').trim();
  if (code) return `pc:${code}`;
  const email = String(student.payer_email || '').trim().toLowerCase();
  if (email) return `em:${email}`;
  return null;
}

export function sameConsultationFamily(
  a: ConsultationFamilyStudent,
  b: ConsultationFamilyStudent,
): boolean {
  const keyA = consultationFamilyKey(a);
  const keyB = consultationFamilyKey(b);
  if (!keyA || !keyB) return false;
  return keyA === keyB;
}
