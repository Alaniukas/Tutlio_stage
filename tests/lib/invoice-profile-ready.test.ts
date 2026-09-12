import { describe, expect, it } from 'vitest';
import { isInvoiceProfileComplete, invoiceProfileMissingFields } from '@/lib/invoiceProfileReady';

describe('invoiceProfileReady', () => {
  it('requires company fields for mb', () => {
    expect(isInvoiceProfileComplete({
      entity_type: 'mb',
      business_name: 'UAB Test',
      company_code: '123',
      address: 'Gatvė 1',
      contact_email: 'a@b.lt',
    })).toBe(true);
  });

  it('requires activity number for individuali_veikla', () => {
    const profile = {
      entity_type: 'individuali_veikla',
      activity_number: '123456789',
      contact_phone: '+37060000000',
    };
    expect(isInvoiceProfileComplete(profile)).toBe(true);
    expect(invoiceProfileMissingFields({ ...profile, activity_number: '' })).toContain('activity_number');
  });
});
