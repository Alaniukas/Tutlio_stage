/**
 * DOCX template payload for school contracts — must match CompanyContracts.buildTemplatePayload
 * so parent-completion PDF regeneration uses the same fields as admin contract creation.
 */
export type SchoolContractTemplateStudent = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
  payer_personal_code?: string | null;
  student_address?: string | null;
  student_city?: string | null;
  child_birth_date?: string | null;
  parent_secondary_name?: string | null;
  parent_secondary_email?: string | null;
  parent_secondary_phone?: string | null;
  parent_secondary_personal_code?: string | null;
  parent_secondary_address?: string | null;
  media_publicity_consent?: string | null;
};

export function buildSchoolContractTemplatePayload(params: {
  contractNumber?: string | null;
  annualFee?: string | number | null;
  schoolName?: string | null;
  mediaPublicityConsent?: string | null;
  student: SchoolContractTemplateStudent;
  /**
   * When false (default), omit consent_* booleans — same as admin contract creation.
   * Pass true only when the parent is submitting a fresh media-publicity choice on the
   * completion form; otherwise showing {#consent_agree_selected} can break DOCX→PDF.
   */
  includeMediaConsentFlags?: boolean;
}): Record<string, string | boolean> {
  const st = params.student || {};
  const fullAddress = [st.student_address || '', st.student_city || ''].filter(Boolean).join(', ');
  const parent2NameRaw = String(st.parent_secondary_name || '').trim();
  const parent2EmailRaw = String(st.parent_secondary_email || '').trim();
  const parent2PhoneRaw = String(st.parent_secondary_phone || '').trim();
  const parent2PersonalCodeRaw = String(st.parent_secondary_personal_code || '').trim();
  const parent2AddressRaw = String(st.parent_secondary_address || '').trim();
  const hasParent2 = [parent2NameRaw, parent2EmailRaw, parent2PhoneRaw, parent2PersonalCodeRaw, parent2AddressRaw].some(
    (v) => v.length > 0,
  );
  const parent2Name = hasParent2 ? parent2NameRaw : '';
  const parent2Email = hasParent2 ? parent2EmailRaw : '';
  const parent2Phone = hasParent2 ? parent2PhoneRaw : '';
  const parent2PersonalCode = hasParent2 ? parent2PersonalCodeRaw : '';
  const parent2Address = hasParent2 ? parent2AddressRaw : '';
  const parent2Block = hasParent2
    ? [`${parent2Name}`, `asm. k.: ${parent2PersonalCode}`, `tel. nr.: ${parent2Phone}`, `el. paštas: ${parent2Email}`, `${parent2Address}`].join('\n')
    : '';
  const parent2Inline = hasParent2
    ? `${parent2Name}; asm. k.: ${parent2PersonalCode}; tel. nr.: ${parent2Phone}; el. paštas: ${parent2Email}; ${parent2Address};`
    : '';

  const payload: Record<string, string | boolean> = {
    contract_number: String(params.contractNumber || ''),
    student_name: String(st.full_name || ''),
    student_email: String(st.email || ''),
    student_phone: String(st.phone || ''),
    parent_name: String(st.payer_name || '').trim(),
    parent_email: String(st.payer_email || '').trim(),
    parent_phone: String(st.payer_phone || '').trim(),
    parent_personal_code: String(st.payer_personal_code || '').trim(),
    parent_address: fullAddress,
    parent2_name: parent2Name,
    parent2_email: parent2Email,
    parent2_phone: parent2Phone,
    parent2_personal_code: parent2PersonalCode,
    parent2_address: parent2Address,
    parent2_adress: parent2Address,
    parent2_block: parent2Block,
    parent2_inline: parent2Inline,
    child_birth_date: String(st.child_birth_date || '').trim(),
    address: fullAddress,
    annual_fee: String(params.annualFee ?? ''),
    date: new Date().toLocaleDateString('lt-LT'),
    school_name: String(params.schoolName || ''),
  };

  if (params.includeMediaConsentFlags) {
    const consent = String(params.mediaPublicityConsent || st.media_publicity_consent || '').trim();
    payload.consent_pending = !consent;
    payload.consent_agree_selected = consent === 'agree';
    payload.consent_disagree_selected = consent === 'disagree';
  }

  return payload;
}
