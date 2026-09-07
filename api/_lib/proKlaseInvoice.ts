import { isProKlaseOrg } from './marketMoney.js';

export const PRO_KLASE_VAT_EXEMPTION_NOTE = 'PVM neapmokestinama pagal LR PVMĮ 22 str.';

type InvoicePartyIdentity = {
  name?: string | null;
  companyCode?: string | null;
};

function normalizeIdentityValue(value: string | null | undefined): string {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('lt-LT');
}

/** Match a stored invoice party snapshot to the organization's invoice identity. */
export function invoicePartyMatches(
  party: InvoicePartyIdentity | null | undefined,
  organization: InvoicePartyIdentity | null | undefined,
): boolean {
  if (!party || !organization) return false;

  const partyCode = normalizeIdentityValue(party.companyCode);
  const organizationCode = normalizeIdentityValue(organization.companyCode);
  if (partyCode && organizationCode) return partyCode === organizationCode;

  const partyName = normalizeIdentityValue(party.name);
  const organizationName = normalizeIdentityValue(organization.name);
  return Boolean(partyName && organizationName && partyName === organizationName);
}

/** The exemption belongs only on invoices where Pro Klasė is the seller. */
export function proKlaseVatExemptionNote(
  organizationId: string | null | undefined,
  sellerIsOrganization: boolean,
): string | undefined {
  return isProKlaseOrg(organizationId) && sellerIsOrganization
    ? PRO_KLASE_VAT_EXEMPTION_NOTE
    : undefined;
}
