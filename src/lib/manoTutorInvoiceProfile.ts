/** Eleven-digit Lithuanian personal code (not a postal address). */
export function isLikelyLithuanianPersonalCode(value: string): boolean {
  const compact = String(value || '').trim().replace(/\s+/g, '');
  return /^\d{11}$/.test(compact);
}

export function manoOrgTutorInvoiceAddressError(profile: {
  address?: string | null;
} | null | undefined): string | null {
  const address = String(profile?.address || '').trim();
  if (!address) {
    return 'Korepetitoriaus sąskaitoje būtinas adresas. Užpildykite adresą sąskaitų nustatymuose.';
  }
  if (isLikelyLithuanianPersonalCode(address)) {
    return 'Adreso lauke įrašytas asmens kodas. Įveskite tikrą gyvenamosios vietos adresą sąskaitų nustatymuose.';
  }
  return null;
}
