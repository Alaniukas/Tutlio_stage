import { describe, expect, it } from 'vitest';
import { schoolInvoiceAmountDue, schoolInvoiceCreditPreview, schoolOverpaymentRemaining, type SchoolInvoiceOverpayment } from '../../src/lib/schoolInvoiceOverpayments';
import { schoolInvoiceOverpaymentTranslations } from '../../src/lib/i18n/schoolInvoiceOverpaymentTranslations';

const credit = { amount_eur:12,uses:[{invoice_id:'next',amount_eur:10}],voided_at:null } as SchoolInvoiceOverpayment;
describe('school overpayment arithmetic',()=>{
  it('keeps the service total separate and carries an unused balance',()=>{
    expect(schoolInvoiceAmountDue({total_eur:84,credit_applied_eur:12})).toBe(72);
    expect(schoolInvoiceAmountDue({total_eur:84})).toBe(84);
    expect(schoolOverpaymentRemaining(credit)).toBe(2);
    expect(schoolInvoiceCreditPreview([credit],1)).toEqual({availableEur:2,appliedEur:1,amountDueEur:0});
  });
  it('restores cancelled allocations and ignores voided credits',()=>{
    expect(schoolOverpaymentRemaining({...credit,uses:[{invoice_id:'next',amount_eur:10,released_at:'now'}]})).toBe(12);
    expect(schoolOverpaymentRemaining({...credit,voided_at:'now'})).toBe(0);
    expect(schoolInvoiceAmountDue({total_eur:'10.10',credit_applied_eur:'0.20'})).toBe(9.9);
  });
  it('provides matching localized labels for all 13 legacy locales',()=>{
    expect(Object.keys(schoolInvoiceOverpaymentTranslations)).toHaveLength(13);
    for(const dictionary of Object.values(schoolInvoiceOverpaymentTranslations)) {
      expect(Object.keys(dictionary)).toEqual(Object.keys(schoolInvoiceOverpaymentTranslations.lt));
      expect(Object.values(dictionary).every(value=>value.trim().length>0)).toBe(true);
    }
  });
});
