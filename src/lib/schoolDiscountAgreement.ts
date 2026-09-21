export type SchoolDiscountType = 'percent' | 'amount';

export type SchoolDiscountAgreementInput = {
  subjectId: string | null;
  tutorId?: string | null;
  discountType: SchoolDiscountType;
  discountValue: number;
  validFrom: string;
  validUntil: string;
  note?: string | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSchoolDiscountAgreementInput(
  input: Partial<SchoolDiscountAgreementInput>,
  options: { allowMissingSubject?: boolean } = {},
): SchoolDiscountAgreementInput {
  const subjectId = String(input.subjectId || '').trim() || null;
  const tutorId = String(input.tutorId || '').trim() || null;
  const discountType: SchoolDiscountType = input.discountType === 'amount' ? 'amount' : 'percent';
  const discountValue = Math.round(Math.max(0, Number(input.discountValue) || 0) * 100) / 100;
  const validFrom = String(input.validFrom || '').slice(0, 10);
  const validUntil = String(input.validUntil || '').slice(0, 10);
  const note = String(input.note || '').trim().slice(0, 500) || null;

  if (!subjectId && !options.allowMissingSubject) throw new Error('Pasirinkite užsiėmimą.');
  if (discountValue <= 0) throw new Error('Įveskite nuolaidos dydį.');
  if (discountType === 'percent' && discountValue > 100) {
    throw new Error('Procentinė nuolaida negali viršyti 100 %.');
  }
  if (!YMD.test(validFrom) || !YMD.test(validUntil) || validUntil < validFrom) {
    throw new Error('Nurodykite teisingą nuolaidos galiojimo laikotarpį.');
  }

  return { subjectId, tutorId, discountType, discountValue, validFrom, validUntil, note };
}

export function schoolDiscountValueLabel(type: SchoolDiscountType, value: number): string {
  const normalized = Number(value || 0).toLocaleString('lt-LT', { maximumFractionDigits: 2 });
  return type === 'percent' ? `${normalized} %` : `${normalized} €`;
}

export function schoolDiscountTermsLabel(type: SchoolDiscountType, value: number): string {
  const label = schoolDiscountValueLabel(type, value);
  return type === 'percent'
    ? `${label} nuolaida nuo šių užsiėmimų sumos`
    : `${label} nuolaida nuo šių užsiėmimų mėnesio sumos kiekvienoje sąskaitoje`;
}

export function schoolDiscountAcceptanceStatement(params: {
  agreementNumber: string;
  studentName: string;
  activityLabel: string;
  discountType: SchoolDiscountType;
  discountValue: number;
  validFrom: string;
  validUntil: string;
}): string {
  return [
    `Patvirtinu nuolaidos susitarimą ${params.agreementNumber}.`,
    `Mokinys: ${params.studentName}.`,
    `Užsiėmimai: ${params.activityLabel}.`,
    `Nuolaida: ${schoolDiscountValueLabel(params.discountType, params.discountValue)}.`,
    `Galioja nuo ${params.validFrom} iki ${params.validUntil}.`,
  ].join(' ');
}
