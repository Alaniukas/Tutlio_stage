import { describe, it, expect } from 'vitest';
import { buildSchoolContractTemplatePayload } from '../../api/_lib/schoolContractTemplatePayload';

describe('buildSchoolContractTemplatePayload', () => {
  const baseStudent = {
    full_name: 'Jonukas Pet',
    payer_name: 'Irminta Mal',
    payer_email: 'irminta@example.com',
    payer_phone: '+37067059403',
    payer_personal_code: '12345678901',
    student_address: 'Gatvė 1',
    student_city: 'Vilnius',
    child_birth_date: '2014-01-02',
  };

  it('omits consent flags by default (matches admin contract creation)', () => {
    const payload = buildSchoolContractTemplatePayload({
      contractNumber: 'SUT-1',
      annualFee: 300,
      schoolName: 'Mokykla',
      mediaPublicityConsent: 'agree',
      student: { ...baseStudent, media_publicity_consent: 'agree' },
    });
    expect(payload.consent_pending).toBeUndefined();
    expect(payload.consent_agree_selected).toBeUndefined();
    expect(payload.consent_disagree_selected).toBeUndefined();
    expect(payload.parent_address).toBe('Gatvė 1, Vilnius');
  });

  it('includes consent flags when parent submits a fresh media choice', () => {
    const payload = buildSchoolContractTemplatePayload({
      contractNumber: 'SUT-1',
      annualFee: 300,
      schoolName: 'Mokykla',
      mediaPublicityConsent: 'disagree',
      student: baseStudent,
      includeMediaConsentFlags: true,
    });
    expect(payload.consent_pending).toBe(false);
    expect(payload.consent_agree_selected).toBe(false);
    expect(payload.consent_disagree_selected).toBe(true);
  });

  it('clears parent2 fields when no secondary parent data is present', () => {
    const payload = buildSchoolContractTemplatePayload({
      contractNumber: 'SUT-1',
      annualFee: 0,
      schoolName: 'Mokykla',
      student: baseStudent,
    });
    expect(payload.parent2_name).toBe('');
    expect(payload.parent2_block).toBe('');
    expect(payload.parent2_inline).toBe('');
  });
});
