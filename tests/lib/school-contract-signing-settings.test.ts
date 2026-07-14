import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHOOL_CONTRACT_SIGNING_REASON,
  mergeSchoolContractSigningSettings,
  parseSchoolContractSigningSettings,
} from '../../src/lib/schoolContractSigningSettings';

describe('school contract signing settings', () => {
  it('falls back to the organization email and stable GoSign metadata defaults', () => {
    expect(parseSchoolContractSigningSettings({}, 'info@school.lt')).toEqual({
      email: 'info@school.lt',
      reason: DEFAULT_SCHOOL_CONTRACT_SIGNING_REASON,
      location: '',
      contact: 'info@school.lt',
    });
  });

  it('round-trips signing settings without overwriting unrelated organization features', () => {
    const merged = mergeSchoolContractSigningSettings(
      { school_contract_esign: true, custom_branding: true },
      {
        email: 'sutartys@school.lt',
        reason: 'Mokymosi sutartis',
        location: 'Vilnius',
        contact: '+37060000000',
      },
    );
    expect(merged).toMatchObject({
      school_contract_esign: true,
      custom_branding: true,
      school_contract_signing_email: 'sutartys@school.lt',
      school_contract_signature_reason: 'Mokymosi sutartis',
      school_contract_signature_location: 'Vilnius',
      school_contract_signature_contact: '+37060000000',
    });
    expect(parseSchoolContractSigningSettings(merged, 'fallback@school.lt')).toEqual({
      email: 'sutartys@school.lt',
      reason: 'Mokymosi sutartis',
      location: 'Vilnius',
      contact: '+37060000000',
    });
  });
});

