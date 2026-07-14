export interface SchoolContractSigningSettings {
  email: string;
  reason: string;
  location: string;
  contact: string;
}

export const DEFAULT_SCHOOL_CONTRACT_SIGNING_REASON = 'Ugdymo sutarties pasirašymas';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseSchoolContractSigningSettings(
  features: unknown,
  organizationEmail = '',
): SchoolContractSigningSettings {
  const f = features && typeof features === 'object' && !Array.isArray(features)
    ? features as Record<string, unknown>
    : {};
  const email = text(f.school_contract_signing_email) || text(organizationEmail);
  return {
    email,
    reason: text(f.school_contract_signature_reason) || DEFAULT_SCHOOL_CONTRACT_SIGNING_REASON,
    location: text(f.school_contract_signature_location),
    contact: text(f.school_contract_signature_contact) || email,
  };
}

export function mergeSchoolContractSigningSettings(
  features: unknown,
  settings: SchoolContractSigningSettings,
): Record<string, unknown> {
  const f = features && typeof features === 'object' && !Array.isArray(features)
    ? { ...(features as Record<string, unknown>) }
    : {};
  return {
    ...f,
    school_contract_signing_email: settings.email.trim(),
    school_contract_signature_reason: settings.reason.trim(),
    school_contract_signature_location: settings.location.trim(),
    school_contract_signature_contact: settings.contact.trim(),
  };
}

