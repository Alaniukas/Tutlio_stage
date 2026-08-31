import { isProKlaseOrg } from './marketMoney.js';

export const PROKLASE_PRIVACY_PDF_PATH = '/legal/proklase-privatumo-politika.pdf';
export const PROKLASE_TERMS_PDF_PATH = '/legal/proklase-paslaugu-teikimo-salygos.pdf';

export function usesProKlaseLegalDocs(orgIdOrSlug?: string | null): boolean {
  return isProKlaseOrg(orgIdOrSlug);
}

export function proKlaseLegalHref(kind: 'privacy' | 'terms'): string {
  return kind === 'privacy' ? PROKLASE_PRIVACY_PDF_PATH : PROKLASE_TERMS_PDF_PATH;
}

export function parentLegalAcceptanceMissing(opts: {
  orgIdOrSlug?: string | null;
  acceptedPrivacy?: boolean;
  acceptedTerms?: boolean;
}): boolean {
  return opts.acceptedPrivacy !== true || opts.acceptedTerms !== true;
}

export function isAcceptedFlag(value: unknown): boolean {
  return value === true || value === 'true';
}
