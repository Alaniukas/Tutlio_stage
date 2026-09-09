import { describe, expect, it } from 'vitest';
import { consultationFamilyKey, sameConsultationFamily } from '@/lib/schoolConsultationFamily';

describe('schoolConsultationFamily', () => {
  it('prefers payer personal code', () => {
    expect(
      consultationFamilyKey({
        payer_personal_code: '39001010000',
        payer_email: 'a@b.lt',
      }),
    ).toBe('pc:39001010000');
  });

  it('falls back to email', () => {
    expect(consultationFamilyKey({ payer_email: 'Parent@Mail.lt' })).toBe('em:parent@mail.lt');
  });

  it('matches siblings', () => {
    const a = { payer_personal_code: '111' };
    const b = { payer_personal_code: '111' };
    expect(sameConsultationFamily(a, b)).toBe(true);
  });
});
