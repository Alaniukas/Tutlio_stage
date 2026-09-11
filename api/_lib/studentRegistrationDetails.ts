/** Registration forms may omit administrator-entered details. Keep them intact. */
export function studentRegistrationDetails(body: Record<string, any>, student: Record<string, any>) {
  const keep = (submitted: unknown, current: unknown) =>
    submitted === undefined || submitted === null || submitted === '' ? current ?? null : submitted;
  const age = keep(body.age, student.age);
  return {
    full_name: keep(body.fullName, student.full_name),
    phone: keep(body.phone, student.phone),
    age: age !== null && Number.isFinite(Number(age)) ? Number(age) : null,
    grade: keep(body.grade, student.grade),
    subject_id: keep(body.subjectId, student.subject_id),
    payment_payer: keep(body.payerType, student.payment_payer),
    payer_name: keep(body.payerName, student.payer_name),
    payer_email: keep(body.payerEmail, student.payer_email),
    payer_phone: keep(body.payerPhone, student.payer_phone),
    accepted_privacy_policy_at: keep(body.acceptedAt, student.accepted_privacy_policy_at),
    accepted_terms_at: keep(body.acceptedAt, student.accepted_terms_at),
  };
}
