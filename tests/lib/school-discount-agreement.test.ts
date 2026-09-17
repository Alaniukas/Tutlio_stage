import { describe, expect, it } from 'vitest';
import {
  normalizeSchoolDiscountAgreementInput,
  schoolDiscountAcceptanceStatement,
  schoolDiscountTermsLabel,
  schoolDiscountValueLabel,
} from '../../src/lib/schoolDiscountAgreement';

describe('school discount agreement', () => {
  it('normalizes a percentage discount and trims the note', () => {
    expect(normalizeSchoolDiscountAgreementInput({
      subjectId: ' subject-1 ',
      tutorId: ' tutor-1 ',
      discountType: 'percent',
      discountValue: 25.127,
      validFrom: '2026-09-01T00:00:00Z',
      validUntil: '2027-06-30',
      note: ' Socialinė nuolaida ',
    })).toEqual({
      subjectId: 'subject-1',
      tutorId: 'tutor-1',
      discountType: 'percent',
      discountValue: 25.13,
      validFrom: '2026-09-01',
      validUntil: '2027-06-30',
      note: 'Socialinė nuolaida',
    });
  });

  it('supports a fixed monthly invoice amount', () => {
    expect(schoolDiscountValueLabel('amount', 12.5)).toBe('12,5 €');
    expect(schoolDiscountTermsLabel('amount', 12.5)).toContain('mėnesio sumos kiekvienoje sąskaitoje');
  });

  it('rejects invalid percentages and date ranges', () => {
    expect(() => normalizeSchoolDiscountAgreementInput({
      subjectId: 'subject-1', discountType: 'percent', discountValue: 101,
      validFrom: '2026-09-01', validUntil: '2027-06-30',
    })).toThrow('negali viršyti 100');
    expect(() => normalizeSchoolDiscountAgreementInput({
      subjectId: 'subject-1', discountType: 'amount', discountValue: 10,
      validFrom: '2027-06-30', validUntil: '2026-09-01',
    })).toThrow('galiojimo laikotarpį');
  });

  it('freezes the exact click-wrap statement', () => {
    const statement = schoolDiscountAcceptanceStatement({
      agreementNumber: 'NPR-1', studentName: 'Jonas Jonaitis', activityLabel: 'Matematika',
      discountType: 'percent', discountValue: 25, validFrom: '2026-09-01', validUntil: '2027-06-30',
    });
    expect(statement).toContain('Patvirtinu nuolaidos susitarimą NPR-1.');
    expect(statement).toContain('Nuolaida: 25 %.');
  });
});
