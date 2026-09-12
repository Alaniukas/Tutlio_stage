export const ORG_INVOICE_PROFILE_INCOMPLETE = 'ORG_INVOICE_PROFILE_INCOMPLETE';

export type InvoiceProfileLike = {
  entity_type?: string | null;
  business_name?: string | null;
  company_code?: string | null;
  address?: string | null;
  activity_number?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

const COMPANY_ENTITIES = new Set(['mb', 'uab', 'ii']);

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Required fields for issuing sales invoices (mirrors api/invoice-settings validation). */
export function invoiceProfileMissingFields(profile: InvoiceProfileLike | null | undefined): string[] {
  if (!profile) return ['profile'];
  const missing: string[] = [];
  const entityType = String(profile.entity_type || '').trim();

  if (!entityType) {
    missing.push('entity_type');
    return missing;
  }

  if (COMPANY_ENTITIES.has(entityType)) {
    if (!hasText(profile.business_name)) missing.push('business_name');
    if (!hasText(profile.company_code)) missing.push('company_code');
    if (!hasText(profile.address)) missing.push('address');
  } else if (!hasText(profile.activity_number)) {
    missing.push('activity_number');
  }

  if (!hasText(profile.contact_email) && !hasText(profile.contact_phone)) {
    missing.push('contact');
  }

  return missing;
}

export function isInvoiceProfileComplete(profile: InvoiceProfileLike | null | undefined): boolean {
  return invoiceProfileMissingFields(profile).length === 0;
}
