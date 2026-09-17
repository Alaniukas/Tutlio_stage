import { isMoksloVaisiaiOrg, isProKlaseOrg } from './marketMoney.js';

/** MV-only: a child without a contact email receives lesson information through the payer. */
export function moksloVaisiaiRoutesLessonCommsToPayer(opts: {
  organizationId?: string | null;
  tutorOrganizationId?: string | null;
  tutorOrganizationSlug?: string | null;
  studentEmail?: string | null;
  linkedUserId?: string | null;
}): boolean {
  const isMv =
    isMoksloVaisiaiOrg(opts.organizationId) ||
    isMoksloVaisiaiOrg(opts.tutorOrganizationId) ||
    isMoksloVaisiaiOrg(opts.tutorOrganizationSlug);
  if (!isMv) return false;
  return !String(opts.studentEmail ?? '').trim();
}

/** Managed child usernames in MV and Pro Klasė use the parent's real inbox. */
export function managedFamilyRoutesLessonCommsToPayer(opts: {
  organizationId?: string | null;
  tutorOrganizationId?: string | null;
  tutorOrganizationSlug?: string | null;
  studentEmail?: string | null;
  linkedUserId?: string | null;
}): boolean {
  const isManagedFamilyOrg = [
    opts.organizationId,
    opts.tutorOrganizationId,
    opts.tutorOrganizationSlug,
  ].some((value) => isMoksloVaisiaiOrg(value) || isProKlaseOrg(value));
  return isManagedFamilyOrg && !String(opts.studentEmail ?? '').trim();
}

export function moksloVaisiaiPayerInboxEmail(row: {
  payer_email?: string | null;
} | null | undefined): string | null {
  const payer = String(row?.payer_email ?? '').trim();
  return payer || null;
}
