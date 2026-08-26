import { describe, expect, it } from 'vitest';
import {
  parentLegalAcceptanceMissing,
  proKlaseLegalHref,
  PROKLASE_PRIVACY_PDF_PATH,
  PROKLASE_TERMS_PDF_PATH,
  usesProKlaseLegalDocs,
} from '../../src/lib/proKlaseLegal';

describe('Pro Klasė legal docs', () => {
  it('uses Pro Klasė PDFs for the production and QA orgs', () => {
    expect(usesProKlaseLegalDocs('3422031d-6e21-424d-980b-35a9c6d7b8f1')).toBe(true);
    expect(usesProKlaseLegalDocs('b0a00000-7e57-4000-8000-000000000001')).toBe(true);
    expect(usesProKlaseLegalDocs('proklase-qa')).toBe(true);
    expect(usesProKlaseLegalDocs('c1a00000-7e57-4000-8000-000000000001')).toBe(false);
    expect(proKlaseLegalHref('privacy')).toBe(PROKLASE_PRIVACY_PDF_PATH);
    expect(proKlaseLegalHref('terms')).toBe(PROKLASE_TERMS_PDF_PATH);
  });

  it('requires parent checkboxes only for Pro Klasė', () => {
    expect(parentLegalAcceptanceMissing({
      orgIdOrSlug: 'b0a00000-7e57-4000-8000-000000000001',
      acceptedPrivacy: false,
      acceptedTerms: true,
    })).toBe(true);
    expect(parentLegalAcceptanceMissing({
      orgIdOrSlug: 'b0a00000-7e57-4000-8000-000000000001',
      acceptedPrivacy: true,
      acceptedTerms: true,
    })).toBe(false);
    expect(parentLegalAcceptanceMissing({
      orgIdOrSlug: 'c1a00000-7e57-4000-8000-000000000001',
      acceptedPrivacy: false,
      acceptedTerms: false,
    })).toBe(false);
  });
});
